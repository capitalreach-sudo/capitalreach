import { NextRequest, NextResponse } from "next/server";
import { checkAiAccess } from "@/lib/ai-access";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";

/**
 * Smart match: startups → investors.
 *
 * Deliberately deterministic, no model call. The old version sent up to 60
 * investors to GPT and asked it to invent a matchScore in a forced 60–99 band
 * — every result looked like a strong match, the percentage measured nothing,
 * and the roster was capped at the 60 most recently created investors. Now the
 * score is computed from actual overlap (industry, stage, profile
 * completeness), covers the whole roster, explains itself the same way twice,
 * costs nothing, and returns instantly. (The genuinely generative AI surfaces
 * — pitch analysis, due diligence — still use the model.)
 */

const CAP = 500; // roster bound; well above any near-term investor count

function scoreInvestor(
  inv: { industries: string[]; stages: string[]; minCheck: number | null; maxCheck: number | null; geography: string[] },
  startup: { industry?: string | null; stage?: string | null },
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (startup.industry && inv.industries.includes(startup.industry)) {
    score += 50;
    reasons.push(`invests in ${startup.industry}`);
  }
  if (startup.stage && inv.stages.includes(startup.stage)) {
    score += 30;
    reasons.push(`backs ${startup.stage.replace(/_/g, " ")} companies`);
  }
  // A filled-in thesis is itself a signal the profile is real and active.
  if (inv.minCheck != null || inv.maxCheck != null) {
    score += 10;
    reasons.push("has a stated check size");
  }
  if (inv.geography.length > 0) {
    score += 10;
  }
  return { score, reasons };
}

export async function POST(req: NextRequest) {
  try {
    const authed = await createServerSupabaseClient();
    const { data: { user } } = await authed.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in to use AI tools." }, { status: 401 });
    }
    if (await isAccountSuspended(user.id)) {
      return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
    }

    // Branded and sold as an AI tool, so it obeys the AI paywall like the
    // rest of the family — even though today's scorer is heuristic.
    const ai = await checkAiAccess(user.id);
    if (!ai.allowed) {
      return NextResponse.json({ error: "AI tools are a paid feature. Upgrade your plan to use them.", upgrade: true }, { status: 402 });
    }

    const { industry, stage } = await req.json().catch(() => ({}));

    const supabase = createAdminClient();
    const { data: investors } = await supabase
      .from("investors")
      .select(`
        id, slug, type, industries, stages, min_check, max_check, geography,
        profiles:owner_id ( full_name )
      `)
      .not("stages", "is", null)
      // B18: match against real investors only.
      .eq("is_external", false)
      .limit(CAP);

    if (!investors || investors.length === 0) {
      return NextResponse.json({ matches: [], message: "No investors in the database yet." });
    }

    const scored = investors
      .map((inv) => {
        const name = (inv.profiles as { full_name?: string | null } | null)?.full_name || "Investor";
        const shaped = {
          id: inv.id as string,
          slug: inv.slug as string,
          name,
          type: (inv.type as string) || "angel",
          industries: (inv.industries as string[] | null) || [],
          stages: (inv.stages as string[] | null) || [],
          minCheck: (inv.min_check as number | null) ?? null,
          maxCheck: (inv.max_check as number | null) ?? null,
          geography: (inv.geography as string[] | null) || [],
        };
        const { score, reasons } = scoreInvestor(shaped, { industry, stage });
        return { ...shaped, matchScore: score, matchReason: reasons.length ? `This investor ${reasons.join(", ")}.` : "" };
      })
      // At least one real overlap — a list of 10-point "filled profile" rows
      // would be noise dressed up as matches.
      .filter((m) => m.matchScore >= 30)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 6)
      .map((m) => ({
        ...m,
        initials: m.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase(),
      }));

    return NextResponse.json({ matches: scored });
  } catch (err) {
    console.error("[smart-match]", err);
    return NextResponse.json({ error: "Matching failed. Please try again." }, { status: 500 });
  }
}
