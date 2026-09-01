import { createAdminClient } from "@/lib/supabase-server";

/** Daily AI invocations by tier; -1 is unlimited. */
export function aiDailyLimit(tier: string | null | undefined): number {
  if (tier === "pro" || tier === "pro_investor" || tier === "institution" || tier === "institutional" || tier === "growth") return -1;
  if (tier === "angel" || tier === "starter") return 20;
  // Free tiers get NOTHING. Five free calls a day quietly made every AI
  // feature a free feature with a speed bump; a metered model behind a $0
  // plan is a bill with no payer. (Admins bypass in checkAiAllowance.)
  return 0;
}

/**
 * Database-backed daily limiter (migration 042). Unlike the Upstash limiter,
 * which degrades open when unconfigured, this one always counts. Returns
 * whether the call may proceed; on true, the caller runs the action and then
 * records it with logAiUsage.
 */
export async function checkAiAllowance(userId: string, action: string, tier: string | null | undefined):
  Promise<{ ok: true } | { ok: false; limit: number }> {
  const limit = aiDailyLimit(tier);
  const admin = createAdminClient();
  // "Unlimited" tiers still get a hard backstop: without it a launch-mode
  // growth account (what launch grants everyone) could loop model calls with
  // no ceiling, billing our OpenAI/Anthropic key. 150/day/action is far above
  // any human's real use and far below a runaway loop. Admins exempt below.
  if (limit === -1) {
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const { count: hardCount } = await admin
      .from("ai_usage").select("*", { count: "exact", head: true })
      .eq("user_id", userId).eq("action", action).gte("created_at", dayStart.toISOString());
    if (hardCount !== null && hardCount >= 150) {
      const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (prof?.role === "admin") return { ok: true };
      return { ok: false, limit: 150 };
    }
    return { ok: true };
  }
  // Admins are exempt from billing rules aimed at customers — same rule as
  // checkAiAccess. Checked here (not in aiDailyLimit) because only here is
  // there a userId to check.
  if (limit === 0) {
    const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (prof?.role === "admin") return { ok: true };
    return { ok: false, limit: 0 };
  }
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("ai_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", action)
    .gte("created_at", today.toISOString());
  if (count !== null && count >= limit) return { ok: false, limit };
  return { ok: true };
}

export async function logAiUsage(userId: string, action: string): Promise<void> {
  try {
    await createAdminClient().from("ai_usage").insert({ user_id: userId, action });
  } catch { /* best effort */ }
}
