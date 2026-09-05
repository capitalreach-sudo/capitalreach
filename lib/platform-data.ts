import { createAdminClient } from "@/lib/supabase-server";

export interface PlatformTopStartup {
  name: string; slug: string; industry: string; stage: string;
  mrr: number | null; ai_score: number | null; funding_target: number | null; created_at: string;
}

/** One month of the platform's history. */
export interface PlatformMonth {
  /** YYYY-MM, so it sorts lexically and carries no timezone. */
  month: string;
  /** Listings that went live in that month. */
  listings: number;
  /** Deals that closed in that month. */
  closed: number;
  /** Capital sought by the listings that went live, in that month. */
  sought: number;
}

export interface PlatformData {
  startupCount: number;
  investorCount: number;
  totalRaised: number;
  dealsCount: number;
  byDealStage: Record<string, number>;
  activeDeals: number;
  closeRate: number | null;
  closedCurrencies: string[];
  byIndustry: Record<string, number>;
  byStage: Record<string, number>;
  topStartups: PlatformTopStartup[];
  recentStartups: PlatformTopStartup[];
  /** Twelve months to now, oldest first. Always twelve entries, zeros included. */
  monthly: PlatformMonth[];
  /** The state-of-the-market report band: medians and this-month movement. */
  report: {
    medianByStage: Record<string, number>;
    newThisMonth: number;
  };
  lastUpdated: string;
}

export const EMPTY_PLATFORM_DATA: PlatformData = {
  startupCount: 0, investorCount: 0, totalRaised: 0, dealsCount: 0,
  byDealStage: { intro: 0, due_diligence: 0, term_sheet: 0, closed: 0, passed: 0 },
  activeDeals: 0, closeRate: null, closedCurrencies: [],
  byIndustry: {}, byStage: {}, topStartups: [], recentStartups: [], monthly: [],
  report: { medianByStage: {}, newThisMonth: 0 },
  lastUpdated: new Date(0).toISOString(),
};

/**
 * Public aggregate statistics for the Data Centre. Used by the server page
 * (first paint) and by /api/platform-data (client refresh) so both surfaces
 * are guaranteed to compute the same numbers. Never throws: on any failure
 * it resolves to `null` and callers decide between "zeros" and "retry".
 *
 * Deliberately selects nothing that identifies a deal party — deals are
 * private between their two participants; only aggregates leave here.
 */
export async function computePlatformData(): Promise<PlatformData | null> {
  try {
    const supabase = createAdminClient();
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
        .select("status, amount, currency, closed_at"),
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

    // Twelve months of history, oldest first.
    //
    // Empty months are kept rather than dropped: a line that skips them draws
    // a straight segment across the gap and reads as steady activity, which is
    // the opposite of what happened. The window is built from the calendar
    // rather than from the data, so a quiet platform looks quiet.
    const MONTHS = 12;
    const now = new Date();
    const monthKeys: string[] = [];
    for (let i = MONTHS - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    const monthOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 7) : null);
    const monthly: PlatformMonth[] = monthKeys.map((month) => ({ month, listings: 0, closed: 0, sought: 0 }));
    const indexOfMonth = new Map(monthKeys.map((m, i) => [m, i]));

    for (const s of startupData) {
      const i = indexOfMonth.get(monthOf(s.created_at) ?? "");
      if (i === undefined) continue;
      monthly[i].listings += 1;
      monthly[i].sought += s.funding_target ?? 0;
    }
    for (const d of closedDeals) {
      const i = indexOfMonth.get(monthOf(d.closed_at) ?? "");
      if (i === undefined) continue;
      monthly[i].closed += 1;
    }

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


    // ── The report band: median round target per stage, and this month's
    // new rounds. Medians, not means -- one mega-round must not move the
    // "typical" number the report claims.
    const targetsByStage: Record<string, number[]> = {};
    for (const st of startupData) {
      if (st.stage && st.funding_target) {
        (targetsByStage[st.stage] ??= []).push(st.funding_target);
      }
    }
    const medianByStage: Record<string, number> = {};
    for (const [stage, arr] of Object.entries(targetsByStage)) {
      arr.sort((a, b) => a - b);
      medianByStage[stage] = arr[Math.floor(arr.length / 2)];
    }
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const newThisMonth = startupData.filter((st) => new Date(st.created_at) >= monthStart).length;

    return {
      startupCount: startupData.length,
      investorCount: investors.count ?? 0,
      totalRaised,
      dealsCount: closedDeals.length,
      byDealStage,
      activeDeals,
      closeRate,
      closedCurrencies: currencies,
      byIndustry,
      byStage,
      topStartups,
      recentStartups,
      monthly,
      report: { medianByStage, newThisMonth },
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Platform data error:", error);
    return null;
  }
}
