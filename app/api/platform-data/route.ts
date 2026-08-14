import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

// createAdminClient, not a raw @supabase/supabase-js client: Next patches
// global fetch and caches GET responses, so a raw client's reads can be
// served from the fetch cache for the life of the server process --
// `revalidate = 60` re-runs this route but the stale cached DB response
// comes back anyway. That is exactly how the Data Centre kept reporting an
// empty platform after production was seeded. createAdminClient pins
// cache: "no-store" on every request.
const supabase = createAdminClient();

// Same reason as /api/startups/list — without this the Data Centre serves
// analytics frozen at build time rather than current platform activity.
export const revalidate = 60;

export async function GET() {
  try {
    const [startups, investors, deals] = await Promise.all([
      supabase
        .from("startups")
        .select("id, name, industry, stage, mrr, vaultrise_score, funding_target, status, slug, created_at")
        .eq("status", "active"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "investor"),
      // Every deal, not just closed ones -- the pipeline breakdown below needs
      // the open stages too. Deliberately selects nothing that identifies a
      // party: no startup_id, no investor_id, no names. Deals are private
      // between their two participants and this is a public endpoint; only
      // aggregate counts leave here.
      supabase
        .from("deals")
        .select("status, amount, currency"),
    ]);

    const startupData = startups.data ?? [];
    const allDeals = deals.data ?? [];
    const closedDeals = allDeals.filter((d) => d.status === "closed");
    const totalRaised = closedDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);

    // Pipeline funnel: how many deals sit at each stage right now.
    const PIPELINE_STAGES = ["intro", "due_diligence", "term_sheet", "closed", "passed"] as const;
    const byDealStage: Record<string, number> = {};
    for (const s of PIPELINE_STAGES) {
      byDealStage[s] = allDeals.filter((d) => d.status === s).length;
    }

    // Deals that are live rather than concluded -- the number that says whether
    // anything is actually happening on the platform.
    const activeDeals = allDeals.filter(
      (d) => d.status !== "closed" && d.status !== "passed"
    ).length;

    // Closed vs (closed + passed). Excludes open deals, which have no outcome
    // yet and would otherwise drag the rate down for no reason.
    const concluded = closedDeals.length + byDealStage.passed;
    const closeRate = concluded > 0 ? Math.round((closedDeals.length / concluded) * 100) : null;

    // Amounts span EUR/USD/GBP and summing them would be arithmetically wrong,
    // so report the mix rather than a single misleading total.
    const currencies = Array.from(
      new Set(closedDeals.map((d) => d.currency).filter(Boolean))
    );

    // Industry breakdown
    const byIndustry: Record<string, number> = {};
    startupData.forEach((s) => {
      if (s.industry) byIndustry[s.industry] = (byIndustry[s.industry] ?? 0) + 1;
    });

    // Stage breakdown
    const byStage: Record<string, number> = {};
    startupData.forEach((s) => {
      if (s.stage) byStage[s.stage] = (byStage[s.stage] ?? 0) + 1;
    });

    // Top by AI score (vaultrise_score column)
    const topStartups = [...startupData]
      .filter((s) => s.vaultrise_score != null)
      .sort((a, b) => (b.vaultrise_score ?? 0) - (a.vaultrise_score ?? 0))
      .slice(0, 5)
      .map((s) => ({
        name: s.name,
        slug: s.slug,
        industry: s.industry,
        stage: s.stage,
        mrr: s.mrr,
        ai_score: s.vaultrise_score,
        funding_target: s.funding_target,
        created_at: s.created_at,
      }));

    // Recent listings
    const recentStartups = [...startupData]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map((s) => ({
        name: s.name,
        slug: s.slug,
        industry: s.industry,
        stage: s.stage,
        mrr: s.mrr,
        ai_score: s.vaultrise_score,
        funding_target: s.funding_target,
        created_at: s.created_at,
      }));

    return NextResponse.json(
      {
        startupCount: startupData.length,
        investorCount: investors.count ?? 0,
        totalRaised,
        // Unchanged meaning: closed deals only. The Data Centre's existing stat
        // card reads this, so it keeps counting what it always counted.
        dealsCount: closedDeals.length,
        byDealStage,
        activeDeals,
        closeRate,
        closedCurrencies: currencies,
        byIndustry,
        byStage,
        topStartups,
        recentStartups,
        lastUpdated: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (error) {
    console.error("Platform data error:", error);
    return NextResponse.json(
      { error: "Failed to load platform data" },
      { status: 500 },
    );
  }
}
