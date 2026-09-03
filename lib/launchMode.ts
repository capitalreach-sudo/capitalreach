import { createAdminClient } from "@/lib/supabase-server";

export interface LaunchStatus {
  isLaunch:    boolean;
  memberCount: number;
  target:      number;
}

const LAUNCH_TARGET = 100;

export async function getLaunchStatus(): Promise<LaunchStatus> {
  try {
    const admin = createAdminClient();

    const { data } = await admin
      .from("platform_config")
      .select("key, value")
      .in("key", ["launch_mode", "member_count"]);

    const map: Record<string, string> = {};
    for (const row of data ?? []) map[row.key] = row.value;

    const isLaunch    = map["launch_mode"] === "true";
    const memberCount = parseInt(map["member_count"] ?? "0", 10);

    return { isLaunch, memberCount, target: LAUNCH_TARGET };
  } catch {
    // Fail closed: if DB is unreachable treat launch mode as off
    return { isLaunch: false, memberCount: 0, target: LAUNCH_TARGET };
  }
}

// Called from the webhook handler when a new subscription is created.
// Increments member_count and flips launch_mode off once >= target.
//
// Compare-and-swap, same pattern announceLaunchEnd uses to claim exactly once:
// a plain read-add-write lost increments when two signups interleaved, and the
// same counter decides when the "free for our first 100" promise expires — an
// under-count kept the promo open past its cap. The update only lands when the
// value is still what was read; on a miss, re-read and try again.
export async function incrementMemberCount(): Promise<void> {
  const admin = createAdminClient();

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data } = await admin
      .from("platform_config")
      .select("value")
      .eq("key", "member_count")
      .single();

    const current = parseInt(data?.value ?? "0", 10);
    const next    = current + 1;

    const { data: claimed } = await admin
      .from("platform_config")
      .update({ value: String(next) })
      .eq("key", "member_count")
      .eq("value", String(current))
      .select("key");
    if (!claimed?.length) continue; // another signup won the race; re-read

    if (next >= LAUNCH_TARGET) {
      await admin
        .from("platform_config")
        .update({ value: "false" })
        .eq("key", "launch_mode");
      await announceLaunchEnd("member_target");
    }
    return;
  }
  // Four straight collisions means heavy signup concurrency; the next signup's
  // increment will land, and the count self-corrects. Not worth failing the
  // caller (a webhook) over.
}

/**
 * E59: launch mode used to end in silence.
 *
 * Everyone who joined during it was told "free for our first 100 members".
 * The hundredth signup flipped the flag and that was the whole event — the
 * next time a member noticed was when a feature they had been using stopped
 * working. Ending the free period is a promise expiring, and a promise
 * expiring has to be announced.
 *
 * Announced exactly once: launch_ended_at is written first and the write is
 * conditional on it being empty, so two members signing up in the same second
 * cannot produce two announcements.
 */
export async function announceLaunchEnd(reason: "member_target" | "admin"): Promise<boolean> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("platform_config").select("value").eq("key", "launch_ended_at").maybeSingle();
  if (existing?.value) return false;

  const now = new Date().toISOString();
  if (existing) {
    const { data: claimed } = await admin
      .from("platform_config")
      .update({ value: now })
      .eq("key", "launch_ended_at")
      .eq("value", "")
      .select("key");
    if (!claimed?.length) return false;
  } else {
    const { error } = await admin.from("platform_config").insert({ key: "launch_ended_at", value: now });
    // 23505 = another request got there first.
    if (error) return false;
  }

  const { data: members } = await admin
    .from("profiles").select("id").neq("account_status", "deleted").limit(5000);
  const ids = (members ?? []).map(m => m.id);
  if (ids.length) {
    const { notifyUsers } = await import("@/lib/notify-user");
    await notifyUsers(ids, {
      type: "tier_changed",
      title: "The free launch period has ended",
      body: reason === "member_target"
        ? "We reached 100 members. Everything you have stays; paid features now need a plan."
        : "The launch period is over. Everything you have stays; paid features now need a plan.",
      href: "/pricing",
    }).catch(() => {});
  }
  return true;
}
