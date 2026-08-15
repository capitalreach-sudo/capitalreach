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
}

const filled = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;
const positive = (v: number | null | undefined) => typeof v === "number" && v > 0;

export function listingCompleteness(s: CompletenessInput): {
  percent: number;
  items: CompletenessItem[];
  next: CompletenessItem | null;
} {
  // Declared heaviest-first: `next` is then simply the first miss.
  const items: CompletenessItem[] = [
    { key: "deck", labelKey: "dashboard.ckDeck", weight: 15, done: (s.documents?.length ?? 0) > 0 || filled(s.pitch_deck_url) },
    { key: "problem", labelKey: "dashboard.ckProblem", weight: 10, done: filled(s.problem) },
    { key: "solution", labelKey: "dashboard.ckSolution", weight: 10, done: filled(s.solution) },
    { key: "useOfFunds", labelKey: "dashboard.ckUseOfFunds", weight: 9, done: filled(s.use_of_funds) },
    {
      key: "traction",
      labelKey: "completeness.traction",
      weight: 9,
      done: positive(s.mrr) || positive(s.arr) || positive(s.paying_customers) || positive(s.user_count),
    },
    { key: "founder", labelKey: "dashboard.ckFounder", weight: 8, done: (s.founders?.length ?? 0) > 0 },
    { key: "advantage", labelKey: "dashboard.ckAdvantage", weight: 7, done: filled(s.competitive_advantage) },
    { key: "market", labelKey: "dashboard.ckMarket", weight: 6, done: filled(s.market) },
    { key: "tagline", labelKey: "dashboard.ckTagline", weight: 5, done: filled(s.tagline) },
    { key: "funding", labelKey: "dashboard.ckFunding", weight: 5, done: positive(s.funding_target) },
    { key: "linkedin", labelKey: "dashboard.ckLinkedin", weight: 4, done: !!s.founders?.some((f) => filled(f.linkedin_url)) },
    { key: "milestone", labelKey: "dashboard.ckMilestone", weight: 4, done: (s.milestones?.length ?? 0) > 0 },
    { key: "website", labelKey: "completeness.website", weight: 3, done: filled(s.website) },
    { key: "equity", labelKey: "completeness.equity", weight: 3, done: positive(s.equity_offered) },
    { key: "booking", labelKey: "completeness.booking", weight: 2, done: filled(s.booking_url) },
  ];

  const percent = items.reduce((sum, i) => sum + (i.done ? i.weight : 0), 0);
  const next = items.find((i) => !i.done) ?? null;

  return { percent, items, next };
}
