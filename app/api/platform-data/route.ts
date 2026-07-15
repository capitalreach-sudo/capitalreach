import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Service role bypasses RLS — safe on server only
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  try {
    const [startups, investors, deals] = await Promise.all([
      supabase
        .from("startups")
        .select("id, name, industry, stage, mrr, ai_score, vaultrise_score, funding_target, status, slug, created_at, featured")
        .eq("status", "active"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "investor"),
      supabase
        .from("deals")
        .select("closed_amount")
        .eq("stage", "closed"),
    ]);

    const startupData = startups.data ?? [];
    const totalRaised = (deals.data ?? [])
      .reduce((sum, d) => sum + (d.closed_amount ?? 0), 0);

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
      .filter((s) => (s.vaultrise_score ?? s.ai_score) != null)
      .sort((a, b) => ((b.vaultrise_score ?? b.ai_score) ?? 0) - ((a.vaultrise_score ?? a.ai_score) ?? 0))
      .slice(0, 5)
      .map((s) => ({
        name: s.name,
        slug: s.slug,
        industry: s.industry,
        stage: s.stage,
        mrr: s.mrr,
        ai_score: s.vaultrise_score ?? s.ai_score,
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
        ai_score: s.vaultrise_score ?? s.ai_score,
        funding_target: s.funding_target,
        created_at: s.created_at,
      }));

    return NextResponse.json(
      {
        startupCount: startupData.length,
        investorCount: investors.count ?? 0,
        totalRaised,
        dealsCount: deals.data?.length ?? 0,
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
