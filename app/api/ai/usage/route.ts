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

  // A zero limit means the plan has no AI allowance at all -- there is
  // nothing to count and no meter to fill. Said plainly here so the hub can
  // render dedicated copy instead of "0 of 0 left" over a 0/0-width bar.
  if (limit === 0) {
    return NextResponse.json({
      signedIn: true,
      unlimited: false,
      tier: ai.tier ?? null,
      used: 0,
      limit: 0,
      remaining: 0,
      perAction: {},
    });
  }

  // checkAiAllowance meters PER ACTION; a single count summed across every
  // action here showed "0 left" to a user who had merely spread their runs
  // across the tools. The rows are grouped client-side and the meter reports
  // the busiest tool -- the one closest to its own limit. The 1000-row page
  // cap is far above what a metered tier can log in a day (limit per action
  // times a handful of actions), so no paging is needed.
  const admin = createAdminClient();
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const { data: rows } = await admin
    .from("ai_usage")
    .select("action")
    .eq("user_id", user.id)
    .gte("created_at", today.toISOString())
    .limit(1000);

  const perAction: Record<string, number> = {};
  for (const r of rows ?? []) {
    perAction[r.action] = (perAction[r.action] ?? 0) + 1;
  }
  const used = Object.values(perAction).reduce((max, n) => Math.max(max, n), 0);
  return NextResponse.json({
    signedIn: true,
    unlimited: false,
    tier: ai.tier ?? null,
    // The max across actions, so "N of M" is true of the tool nearest its
    // cap; every other tool has at least this much left.
    used,
    limit,
    remaining: Math.max(0, limit - used),
    perAction,
  });
}
