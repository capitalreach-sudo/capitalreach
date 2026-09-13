import { createAdminClient } from "@/lib/supabase-server";
import { MAX_PLAUSIBLE_AMOUNT } from "@/lib/format";

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
  /** Active listings flagged is_demo. The sample-data disclosure renders
   *  only while this is positive: after the seed data is purged, a footnote
   *  claiming the figures include samples would itself be the false claim. */
  sampleCount: number;
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
  sampleCount: 0, startupCount: 0, investorCount: 0, totalRaised: 0, dealsCount: 0,
  byDealStage: { intro: 0, due_diligence: 0, term_sheet: 0, closed: 0, passed: 0 },
  activeDeals: 0, closeRate: null, closedCurrencies: [],
  byIndustry: {}, byStage: {}, topStartups: [], recentStartups: [], monthly: [],
  report: { medianByStage: {}, newThisMonth: 0 },
  lastUpdated: new Date(0).toISOString(),
};

/**
 * A funding target that can be reported, or null.
 *
 * Zero is the column default for a founder who never stated one -- not a
 * round of nothing. The upper bound is the display layer's (lib/format):
 * production has carried targets of 10^17, and one of those inside a monthly
 * total sets the capital chart's y-scale to it and flattens the other eleven
 * months onto the axis, while the table beside the chart prints an absence
 * dash for that same figure.
 */
function statedTarget(n: number | null | undefined): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n > 0 && n <= MAX_PLAUSIBLE_AMOUNT ? n : null;
}

/**
 * Twelve months of history, oldest first.
 *
 * Empty months are kept rather than dropped: a line that skips them draws a
 * straight segment across the gap and reads as steady activity, which is the
 * opposite of what happened. The window is built from the calendar rather
 * than from the data, so a quiet platform looks quiet.
 *
 * Takes `now` instead of reading the clock so the window can be pinned.
 */
export function buildMonthlySeries(
  now: Date,
  listings: Array<{ created_at: string | null; funding_target: number | null }>,
  closedDeals: Array<{ closed_at: string | null }>,
): PlatformMonth[] {
  const MONTHS = 12;
  const monthKeys: string[] = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const monthOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 7) : null);
  const monthly: PlatformMonth[] = monthKeys.map((month) => ({ month, listings: 0, closed: 0, sought: 0 }));
  const indexOfMonth = new Map(monthKeys.map((m, i) => [m, i]));

  for (const s of listings) {
    const i = indexOfMonth.get(monthOf(s.created_at) ?? "");
    if (i === undefined) continue;
    monthly[i].listings += 1;
    const target = statedTarget(s.funding_target);
    if (target !== null) monthly[i].sought += target;
  }
  for (const d of closedDeals) {
    const i = indexOfMonth.get(monthOf(d.closed_at) ?? "");
    if (i === undefined) continue;
    monthly[i].closed += 1;
  }
  return monthly;
}

/**
 * Every row of a query, paged past PostgREST's silent 1000-row cap.
 *
 * An un-ranged select stops at the server's default page and reports no
 * truncation, so past a thousand startups or deals every aggregate on this
 * page would quietly undercount -- and these numbers are the page's whole
 * job. The caller supplies an explicitly ordered query so pages stay stable
 * while rows are inserted mid-walk. Errors throw, so computePlatformData's
 * catch resolves to null (the retry state) rather than presenting a partial
 * platform as the whole one.
 */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const SIZE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await page(from, from + SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < SIZE) return rows;
  }
}

/**
 * Public aggregate statistics for the Data Centre. Used by the server page
 * (first paint) and by /api/platform-data (client refresh) so both surfaces
 * are guaranteed to compute the same numbers. Never throws: on any failure
 * it resolves to `null` and callers decide between "zeros" and "retry".
 *
 * Deliberately selects nothing that identifies a deal party -- deals are
 * private between their two participants; only aggregates leave here.
 */
export async function computePlatformData(): Promise<PlatformData | null> {
  try {
    const supabase = createAdminClient();
    const [startupData, investors, allDeals] = await Promise.all([
      fetchAll((from, to) =>
        supabase
          .from("startups")
          .select("id, name, industry, stage, vaultrise_score, funding_target, status, slug, created_at, is_demo")
          .eq("status", "active")
          .order("id", { ascending: true })
          .range(from, to),
      ),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "investor"),
      // Every deal, not just closed ones -- the pipeline breakdown below needs
      // the open stages too. Deliberately selects nothing that identifies a
      // party: no startup_id, no investor_id, no names. Deals are private
      // between their two participants and this is a public endpoint; only
      // aggregate counts leave here.
      fetchAll((from, to) =>
        supabase
          .from("deals")
          .select("status, amount, currency, closed_at")
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ]);

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

    const monthly = buildMonthlySeries(new Date(), startupData, closedDeals);

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
        mrr: null,
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
        mrr: null,
        ai_score: s.vaultrise_score,
        funding_target: s.funding_target,
        created_at: s.created_at,
      }));


    // ── The report band: median round target per stage, and this month's
    // new rounds. Medians, not means -- one mega-round must not move the
    // "typical" number the report claims.
    const targetsByStage: Record<string, number[]> = {};
    for (const st of startupData) {
      const target = statedTarget(st.funding_target);
      if (st.stage && target !== null) {
        (targetsByStage[st.stage] ??= []).push(target);
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
      sampleCount: startupData.filter((st) => (st as { is_demo?: boolean }).is_demo).length,
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
