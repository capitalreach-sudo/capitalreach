import { checkAiAccess } from "@/lib/ai-access";
import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { aiDailyLimit } from "@/lib/ai-limits";

/**
 * What's left of today's AI allowance (migration 042).
 *
 * The limit is enforced server-side in every tool route; this endpoint is
 * purely so the UI can say so *before* the user writes a pitch and hits a
 * 429. Anonymous callers get nothing to read -- the tools are gated anyway.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ signedIn: false });

  // The ENTITY tier via checkAiAccess -- the authority every AI gate uses.
  // This meter read profiles.subscription_tier instead, so an account whose
  // two tiers diverged saw "Unlimited" here and 402 on the very next tab.
  const ai = await checkAiAccess(user.id);
  const limit = aiDailyLimit(ai.tier ?? undefined);

  if (limit === -1) {
    return NextResponse.json({ signedIn: true, unlimited: true, tier: ai.tier ?? null });
  }

  const admin = createAdminClient();
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("ai_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", today.toISOString());

  const used = count ?? 0;
  return NextResponse.json({
    signedIn: true,
    unlimited: false,
    tier: ai.tier ?? null,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  });
}
