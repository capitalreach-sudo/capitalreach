/**
 * How finished a listing looks to an investor, 0-100, plus the single most
 * valuable thing still missing.
 *
 * This replaces an unweighted checklist that lived inline in the founder
 * dashboard. That version counted every field the same, so "add a LinkedIn
 * URL" scored exactly as much as "upload a pitch deck", and it listed up to
 * five missing items in declaration order -- which meant the first thing a
 * founder was told to do was rarely the thing that would actually move an
 * investor.
 *
 * The weights are not uniform because the fields are not equally persuasive.
 * A deck is what an investor asks for first and is worth five times a booking
 * link. The traction group counts once from any signal, so a pre-revenue
 * company with users is not penalised for having no MRR. The weights sum to
 * 100 -- tests/listing-completeness.test.ts enforces that, so adding a field
 * forces a deliberate rebalance rather than a silent drift to 97%.
 */
export interface CompletenessItem {
  key: string;
  /** i18n key for the human label -- the lib stays free of copy. */
  labelKey: string;
  weight: number;
  done: boolean;
}

/**
 * Only what the score reads, including the related rows the dashboard already
 * loads. Structural on purpose, so the Startup row satisfies it without a cast.
 */
export interface CompletenessInput {
  tagline?: string | null;
  problem?: string | null;
  solution?: string | null;
  market?: string | null;
  competitive_advantage?: string | null;
  use_of_funds?: string | null;
  website?: string | null;
  pitch_deck_url?: string | null;
  funding_target?: number | null;
  equity_offered?: number | null;
  min_check_size?: number | null;
  booking_url?: string | null;
  mrr?: number | null;
  arr?: number | null;
  paying_customers?: number | null;
  user_count?: number | null;
  founders?: Array<{ linkedin_url?: string | null }> | null;
  documents?: Array<unknown> | null;
  milestones?: Array<unknown> | null;
  // Migration 141 (rich profiles). Same "structural, not a cast" rule as
  // everything above: the shapes only need enough of the row to score it.
  why_now?: string | null;
  key_metrics?: Array<unknown> | null;
  customers?: Array<unknown> | null;
  advisors?: Array<unknown> | null;
  hiring?: Array<unknown> | null;
  round_type?: string | null;
  use_of_funds_breakdown?: Array<unknown> | null;
  press?: Array<unknown> | null;
  awards?: Array<unknown> | null;
  product_screenshots?: string[] | null;
}

const filled = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;
const positive = (v: number | null | undefined) => typeof v === "number" && v > 0;

export function listingCompleteness(s: CompletenessInput): {
  percent: number;
  items: CompletenessItem[];
  next: CompletenessItem | null;
} {
  // Declared heaviest-first: `next` is then simply the first miss. Migration
  // 141's twelve new columns are folded in at low-to-mid weight -- none of
  // them are as persuasive to an investor as a deck or a problem statement,
  // so the original items were scaled down (not dropped) to make room rather
  // than diluted by simply appending 100 more points on top. Total is still
  // exactly 100; tests/listing-completeness.test.ts enforces that.
  const hasAny = (v: Array<unknown> | null | undefined) => (v?.length ?? 0) > 0;
  const items: CompletenessItem[] = [
    { key: "deck", labelKey: "dashboard.ckDeck", weight: 13, done: (s.documents?.length ?? 0) > 0 || filled(s.pitch_deck_url) },
    { key: "problem", labelKey: "dashboard.ckProblem", weight: 8, done: filled(s.problem) },
    { key: "solution", labelKey: "dashboard.ckSolution", weight: 8, done: filled(s.solution) },
    { key: "useOfFunds", labelKey: "dashboard.ckUseOfFunds", weight: 7, done: filled(s.use_of_funds) },
    {
      key: "traction",
      labelKey: "completeness.traction",
      weight: 7,
      done: positive(s.mrr) || positive(s.arr) || positive(s.paying_customers) || positive(s.user_count),
    },
    { key: "founder", labelKey: "dashboard.ckFounder", weight: 6, done: (s.founders?.length ?? 0) > 0 },
    { key: "advantage", labelKey: "dashboard.ckAdvantage", weight: 6, done: filled(s.competitive_advantage) },
    { key: "market", labelKey: "dashboard.ckMarket", weight: 5, done: filled(s.market) },
    { key: "tagline", labelKey: "dashboard.ckTagline", weight: 4, done: filled(s.tagline) },
    { key: "funding", labelKey: "dashboard.ckFunding", weight: 4, done: positive(s.funding_target) },
    { key: "whyNow", labelKey: "completeness.whyNow", weight: 3, done: filled(s.why_now) },
    { key: "keyMetrics", labelKey: "completeness.keyMetrics", weight: 3, done: hasAny(s.key_metrics) },
    { key: "useOfFundsBreakdown", labelKey: "completeness.useOfFundsBreakdown", weight: 3, done: hasAny(s.use_of_funds_breakdown) },
    { key: "linkedin", labelKey: "dashboard.ckLinkedin", weight: 3, done: !!s.founders?.some((f) => filled(f.linkedin_url)) },
    { key: "milestone", labelKey: "dashboard.ckMilestone", weight: 3, done: (s.milestones?.length ?? 0) > 0 },
    { key: "customers", labelKey: "completeness.customers", weight: 2, done: hasAny(s.customers) },
    { key: "advisors", labelKey: "completeness.advisors", weight: 2, done: hasAny(s.advisors) },
    { key: "proof", labelKey: "completeness.proof", weight: 2, done: hasAny(s.press) || hasAny(s.awards) },
    { key: "roundType", labelKey: "completeness.roundType", weight: 2, done: filled(s.round_type) },
    { key: "screenshots", labelKey: "completeness.screenshots", weight: 2, done: hasAny(s.product_screenshots) },
    { key: "website", labelKey: "completeness.website", weight: 2, done: filled(s.website) },
    { key: "equity", labelKey: "completeness.equity", weight: 2, done: positive(s.equity_offered) },
    { key: "booking", labelKey: "completeness.booking", weight: 2, done: filled(s.booking_url) },
    { key: "hiring", labelKey: "completeness.hiring", weight: 1, done: hasAny(s.hiring) },
  ];

  const percent = items.reduce((sum, i) => sum + (i.done ? i.weight : 0), 0);
  const next = items.find((i) => !i.done) ?? null;

  return { percent, items, next };
}
