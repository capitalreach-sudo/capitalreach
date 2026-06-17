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
export async function incrementMemberCount(): Promise<void> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("platform_config")
    .select("value")
    .eq("key", "member_count")
    .single();

  const current = parseInt(data?.value ?? "0", 10);
  const next    = current + 1;

  await admin
    .from("platform_config")
    .update({ value: String(next) })
    .eq("key", "member_count");

  if (next >= LAUNCH_TARGET) {
    await admin
      .from("platform_config")
      .update({ value: "false" })
      .eq("key", "launch_mode");
  }
}
