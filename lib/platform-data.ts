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
  /** Medians and this-month movement. */
  report: {
    /** Median stated round target per stage. Only stages with at least
     *  MEDIAN_MIN_N stated targets appear: below that the "median" is one
     *  listing's own target, and this payload reaches viewers whose listing
     *  names are withheld. */
    medianByStage: Record<string, number>;
    /** How many stated targets sit behind each median above (same keys). */
    medianCountByStage: Record<string, number>;
    newThisMonth: number;
  };
  /** Sum of amounts on deals that are open (neither closed nor passed) --
   *  capital genuinely in motion, distinct from totalRaised, which only
   *  counts money that actually closed. Real, not fabricated: the same
   *  amount field the closed-deal total sums, filtered to the other rows. */
  capitalInMotion: number;
  /** Currencies behind capitalInMotion, same mixed-currency disclosure
   *  convention as closedCurrencies. */
  capitalInMotionCurrencies: string[];
  /** The pipeline stage of the platform's sole open deal, only when exactly
   *  one is open -- a days-in-stage figure is an honest single-subject stat
   *  at n=1 and a meaningless average at n>1, so it is null otherwise. */
  activeDealStage: string | null;
  /** Days since that one open deal entered its current stage. Null unless
   *  activeDealStage is set. */
  activeDealDaysInStage: number | null;
  /** Real anonymous pageviews across every active, non-demo startup, one
   *  entry per day for a trailing 42-day window (oldest first), zeros
   *  included so a quiet day is a real zero rather than a missing point. */
  dailyPageviews: Array<{ date: string; count: number }>;
  /** Investor-attributed startup views (startup_views rows) across the same
   *  real startups, all time -- the other half of "who is looking",
   *  deliberately reported apart from the anonymous pageviews above rather
   *  than blended into one number that would hide which is which. */
  investorViewCount: number;
  lastUpdated: string;
}

/** The fewest stated targets a stage needs before its median is published. */
export const MEDIAN_MIN_N = 3;

export const EMPTY_PLATFORM_DATA: PlatformData = {
  sampleCount: 0, startupCount: 0, investorCount: 0, totalRaised: 0, dealsCount: 0,
  byDealStage: { intro: 0, due_diligence: 0, term_sheet: 0, closed: 0, passed: 0 },
  activeDeals: 0, closeRate: null, closedCurrencies: [],
  byIndustry: {}, byStage: {}, topStartups: [], recentStartups: [], monthly: [],
  report: { medianByStage: {}, medianCountByStage: {}, newThisMonth: 0 },
  capitalInMotion: 0, capitalInMotionCurrencies: [],
  activeDealStage: null, activeDealDaysInStage: null,
  dailyPageviews: [], investorViewCount: 0,
  lastUpdated: new Date(0).toISOString(),
};

/** The DB has carried both "pre_seed" and "pre-seed"; only the second is a
 *  display key, so raw enums never reach the page. */
function normaliseStage(stage: string | null | undefined): string {
  return stage === "pre_seed" ? "pre-seed" : (stage ?? "");
}

/** Middle value of a sorted copy; the mean of the two middle values when the
 *  count is even. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

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
      // The directory's own definition, so /data and /investors agree: a
      // profile row alone also counts unlisted test fixtures (is_public
      // false) and demo seeds, which inflated this figure after the purge.
      supabase
        .from("investors")
        .select("id", { count: "exact", head: true })
        .eq("is_public", true)
        .eq("is_external", false)
        .eq("is_demo", false),
      // Every deal, not just closed ones -- the pipeline breakdown below needs
      // the open stages too. Deliberately selects nothing that identifies a
      // party: no startup_id, no investor_id, no names. Deals are private
      // between their two participants and this is a public endpoint; only
      // aggregate counts leave here.
      fetchAll((from, to) =>
        supabase
          .from("deals")
          .select("status, amount, currency, closed_at, stage_entered_at, created_at")
          .eq("is_demo", false)
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

    // Capital in motion: what is being negotiated right now, as distinct
    // from totalRaised (what has actually closed). Same mixed-currency
    // disclosure as the closed total, computed over the open rows instead.
    const openDeals = allDeals.filter((d) => d.status !== "closed" && d.status !== "passed");
    const capitalInMotion = openDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
    const capitalInMotionCurrencies = Array.from(
      new Set(openDeals.map((d) => d.currency).filter(Boolean))
    );

    // Days in the current stage, but only when there is exactly one open
    // deal -- a single subject's own trend is an honest stat; an average
    // over several stands in for a distribution the platform does not yet
    // have. stage_entered_at is null for a deal that has never moved off
    // its opening stage, so created_at is the fallback start of the clock.
    const singleOpenDeal = openDeals.length === 1 ? openDeals[0] : null;
    const activeDealStage = singleOpenDeal?.status ?? null;
    const activeDealDaysInStage = singleOpenDeal
      ? Math.max(0, Math.floor(
          (Date.now() - new Date(singleOpenDeal.stage_entered_at ?? singleOpenDeal.created_at).getTime())
          / 86_400_000,
        ))
      : null;

    const monthly = buildMonthlySeries(new Date(), startupData, closedDeals);

    // Real activity: anonymous pageviews and investor-attributed startup
    // views, scoped to real (non-demo, active) startups only -- pageviews
    // carries no is_demo flag of its own, so the scope has to travel in as
    // the id list rather than as a filter on the table itself.
    const realStartupIds = startupData
      .filter((s) => !(s as { is_demo?: boolean }).is_demo)
      .map((s) => s.id);
    const now = new Date();
    const PULSE_DAYS = 42;
    const pulseStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (PULSE_DAYS - 1)));

    const [pageviewRows, startupViewRows] = realStartupIds.length > 0
      ? await Promise.all([
          fetchAll<{ created_at: string }>((from, to) =>
            supabase
              .from("pageviews")
              .select("created_at")
              .in("startup_id", realStartupIds)
              .gte("created_at", pulseStart.toISOString())
              .order("created_at", { ascending: true })
              .range(from, to),
          ),
          fetchAll<{ id: string }>((from, to) =>
            supabase
              .from("startup_views")
              .select("id")
              .in("startup_id", realStartupIds)
              .order("id", { ascending: true })
              .range(from, to),
          ),
        ])
      : [[], []];

    // Every day in the window gets an entry, zeros included -- the same
    // "a quiet day is a real zero" principle buildMonthlySeries already
    // applies to months, extended to days.
    const dayKeys: string[] = [];
    for (let i = PULSE_DAYS - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      dayKeys.push(d.toISOString().slice(0, 10));
    }
    const dayCounts = new Map(dayKeys.map((k) => [k, 0]));
    for (const pv of pageviewRows) {
      const day = pv.created_at.slice(0, 10);
      if (dayCounts.has(day)) dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }
    const dailyPageviews = dayKeys.map((date) => ({ date, count: dayCounts.get(date) ?? 0 }));
    const investorViewCount = startupViewRows.length;

    // Industry breakdown
    const byIndustry: Record<string, number> = {};
    startupData.forEach((s) => {
      if (s.industry) byIndustry[s.industry] = (byIndustry[s.industry] ?? 0) + 1;
    });

    // Stage breakdown
    const byStage: Record<string, number> = {};
    startupData.forEach((s) => {
      const stage = normaliseStage(s.stage);
      if (stage) byStage[stage] = (byStage[stage] ?? 0) + 1;
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
        stage: normaliseStage(s.stage),
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
        stage: normaliseStage(s.stage),
        mrr: null,
        ai_score: s.vaultrise_score,
        funding_target: s.funding_target,
        created_at: s.created_at,
      }));


    // Median round target per stage, and this month's new rounds. Medians,
    // not means: one mega-round must not move the "typical" number. A stage
    // with fewer than MEDIAN_MIN_N stated targets publishes nothing, so no
    // single listing's target leaves this function.
    const targetsByStage: Record<string, number[]> = {};
    for (const st of startupData) {
      const stage = normaliseStage(st.stage);
      const target = statedTarget(st.funding_target);
      if (stage && target !== null) {
        (targetsByStage[stage] ??= []).push(target);
      }
    }
    const medianByStage: Record<string, number> = {};
    const medianCountByStage: Record<string, number> = {};
    for (const [stage, arr] of Object.entries(targetsByStage)) {
      if (arr.length < MEDIAN_MIN_N) continue;
      const m = median(arr);
      if (m === null) continue;
      medianByStage[stage] = m;
      medianCountByStage[stage] = arr.length;
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
      report: { medianByStage, medianCountByStage, newThisMonth },
      capitalInMotion,
      capitalInMotionCurrencies,
      activeDealStage,
      activeDealDaysInStage,
      dailyPageviews,
      investorViewCount,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Platform data error:", error);
    return null;
  }
}
