import { createAdminClient } from "@/lib/supabase-server";

/** Daily AI invocations by tier; -1 is unlimited. */
export function aiDailyLimit(tier: string | null | undefined): number {
  if (tier === "pro_investor" || tier === "institutional" || tier === "growth") return -1;
  if (tier === "angel" || tier === "starter") return 20;
  return 5;
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
  if (limit === -1) return { ok: true };
  const admin = createAdminClient();
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
