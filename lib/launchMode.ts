import { createAdminClient } from "@/lib/supabase-server";

export interface LaunchStatus {
  isLaunch:    boolean;
  memberCount: number;
  target:      number;
}

// The founding cohort's size lives in platform_config (migration 110) so it
// can move without a deploy. This constant is only the floor used when that
// row cannot be read -- it was the whole truth once, which is why the launch
// banner went on promising "3/100" after the target became 150.
const LAUNCH_TARGET_FALLBACK = 150;

export async function getLaunchStatus(): Promise<LaunchStatus> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("platform_config")
      .select("key, value")
      .in("key", ["launch_mode", "member_count", "founding_target"]);
    if (error) throw error;

    const map: Record<string, string> = {};
    for (const row of data ?? []) map[row.key] = row.value;

    const isLaunch    = map["launch_mode"] === "true";
    const memberCount = parseInt(map["member_count"] ?? "0", 10);

    const target = parseInt(map["founding_target"] ?? "", 10) || LAUNCH_TARGET_FALLBACK;
    return { isLaunch, memberCount, target };
  } catch (err) {
    // Fail closed: if DB is unreachable treat launch mode as off. Every caller
    // reads this as settled platform state, so a query that errored has to
    // leave a trace somewhere rather than pass for "launch is over".
    console.error("[launchMode] status read failed:", err);
    return { isLaunch: false, memberCount: 0, target: LAUNCH_TARGET_FALLBACK };
  }
}

// Called from the webhook handler when a new subscription is created.
// Increments member_count and flips launch_mode off once >= target.
//
// Compare-and-swap, same pattern announceLaunchEnd uses to claim exactly once:
// a plain read-add-write lost increments when two signups interleaved, and the
// same counter decides when the founding cohort's free period expires — an
// under-count kept the promo open past its cap. The update only lands when the
// value is still what was read; on a miss, re-read and try again.
export async function incrementMemberCount(): Promise<void> {
  const admin = createAdminClient();

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await admin
      .from("platform_config")
      .select("value")
      .eq("key", "member_count")
      .single();
    // A failed read leaves `current` at 0, and the swap below then compares
    // against a value nobody holds: the attempt is spent on an update that
    // could never land. Re-read instead.
    if (error) { console.error("[launchMode] member_count read failed:", error.message); continue; }

    const current = parseInt(data?.value ?? "0", 10);
    const next    = current + 1;

    const { data: claimed } = await admin
      .from("platform_config")
      .update({ value: String(next) })
      .eq("key", "member_count")
      .eq("value", String(current))
      .select("key");
    if (!claimed?.length) continue; // another signup won the race; re-read

    const { data: targetRow, error: targetError } = await admin
      .from("platform_config").select("value").eq("key", "founding_target").maybeSingle();
    // The fallback is a floor, not the configured cohort: an unreadable row
    // would close the founding period early for any target above it.
    if (targetError) console.error("[launchMode] founding_target read failed:", targetError.message);
    const closeAt = parseInt(targetRow?.value ?? "", 10) || LAUNCH_TARGET_FALLBACK;
    if (next >= closeAt) {
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

  const { data: existing, error: existingError } = await admin
    .from("platform_config").select("value").eq("key", "launch_ended_at").maybeSingle();
  // An unreadable row is not an unclaimed one. Treated as absent it falls
  // through to the insert, which loses to 23505 and drops the announcement
  // for good; leaving the claim unmade lets the next call make it.
  if (existingError) {
    console.error("[launchMode] launch_ended_at read failed:", existingError.message);
    return false;
  }
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

  // The cohort size is admin-editable, so the number this message quotes is
  // read at send time: written down, it told every member "we reached 100" on
  // the signup that filled a cohort of 150.
  const { data: targetRow, error: targetError } = await admin
    .from("platform_config").select("value").eq("key", "founding_target").maybeSingle();
  if (targetError) console.error("[launchMode] founding_target read failed:", targetError.message);
  const target = parseInt(targetRow?.value ?? "", 10) || LAUNCH_TARGET_FALLBACK;

  const { data: members, error: membersError } = await admin
    .from("profiles").select("id").neq("account_status", "deleted").limit(5000);
  if (membersError) console.error("[launchMode] member list read failed:", membersError.message);
  const ids = (members ?? []).map(m => m.id);
  if (ids.length) {
    const { notifyUsers } = await import("@/lib/notify-user");
    await notifyUsers(ids, {
      type: "tier_changed",
      title: "The free launch period has ended",
      body: reason === "member_target"
        ? `We reached ${target} members. Everything you have stays; paid features now need a plan.`
        : "The launch period is over. Everything you have stays; paid features now need a plan.",
      href: "/pricing",
    }).catch(() => {});
  }
  return true;
}
