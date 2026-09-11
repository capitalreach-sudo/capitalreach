"use client";

import { useTranslation } from "@/hooks/useTranslation";

/**
 * The score and what it is, in one component.
 *
 * The caption is not a prop and there is no flag to suppress it. That is the
 * whole reason this exists as a component rather than as a paragraph a caller
 * is trusted to place underneath: a figure out of 100 beside a company's name
 * reads as a rating of the company, and every surface that renders one takes
 * on the claim. A caption that can be omitted gets omitted on the card, the
 * search row, and the comparison table, which are exactly the places a reader
 * has least context.
 *
 * The five dimensions are named for what is actually assessed. They used to
 * carry the vocabulary of an investment judgement -- team, market, product,
 * traction, terms -- which says the score weighed those things. It did not. It
 * read whether each section of the submission was filled in and whether the
 * figures in it contradict each other, so the names say that instead.
 */

export const SCORE_DIMENSION_KEYS = [
  "clarity",
  "marketSizing",
  "differentiation",
  "teamInfo",
  "metrics",
] as const;

export type ScoreDimensionKey = (typeof SCORE_DIMENSION_KEYS)[number];

export interface ScoreDimension {
  readonly key: ScoreDimensionKey;
  readonly label: string;
}

export const SCORE_DIMENSIONS: readonly ScoreDimension[] = [
  { key: "clarity", label: "Clarity of description" },
  { key: "marketSizing", label: "Market sizing provided" },
  { key: "differentiation", label: "Differentiation stated" },
  { key: "teamInfo", label: "Team information provided" },
  { key: "metrics", label: "Metrics provided and consistent" },
];

/** Present, absent, or not established. Null renders as unknown rather than as
 *  a gap, because a caller that has not loaded a field has not found it empty. */
export type DimensionState = boolean | null;

export type ScoreDimensionStates = Partial<Record<ScoreDimensionKey, DimensionState>>;

/**
 * The five dimensions read off a listing.
 *
 * Exported so every surface derives them the same way. The inputs are the ones
 * the scoring pass in lib/openai.ts actually reads, so the breakdown cannot
 * describe a different submission than the number does.
 */
export function scoreDimensionsFromListing(listing: {
  problem?: string | null;
  solution?: string | null;
  market?: string | null;
  competitive_advantage?: string | null;
  mrr?: number | null;
  arr?: number | null;
  user_count?: number | null;
  founderCount?: number | null;
}): ScoreDimensionStates {
  const filled = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;
  const given = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v);
  // Twelve months of MRR is the only cross-check available from the listing
  // itself. Where one of the pair is missing there is nothing to contradict,
  // which is not the same as the pair agreeing.
  const bothRevenue = given(listing.mrr) && given(listing.arr);
  const consistent = bothRevenue
    ? Math.abs((listing.arr as number) - (listing.mrr as number) * 12) <= (listing.arr as number) * 0.15
    : true;
  const anyMetric = given(listing.mrr) || given(listing.arr) || given(listing.user_count);
  return {
    clarity: filled(listing.problem) && filled(listing.solution),
    marketSizing: filled(listing.market),
    differentiation: filled(listing.competitive_advantage),
    teamInfo: given(listing.founderCount) ? (listing.founderCount as number) > 0 : null,
    metrics: anyMetric ? consistent : false,
  };
}

const UI = "'DM Sans', sans-serif";
const MONO = "'JetBrains Mono', monospace";

const SIZES = {
  sm: { figure: "17px", caption: "11px", label: "8.5px" },
  md: { figure: "24px", caption: "11.5px", label: "9px" },
  lg: { figure: "34px", caption: "12.5px", label: "9.5px" },
} as const;

/**
 * The caption alone, for a surface that shows MANY scores.
 *
 * On the detail page the figure and its caption are one block, and that is the
 * right shape when there is one score on the page. A grid of nine cards is a
 * different problem: repeating a 56-character paragraph under every card is
 * five lines of small print nine times over, which is how a disclaimer stops
 * being read. A list gets one note covering the column, the way a table
 * footnote covers a table.
 *
 * It lives in this file and reads the same key so the two can never drift:
 * editing the caption on the detail page edits it here.
 */
export function ScoreCaption({ style }: { style?: React.CSSProperties }) {
  const { t } = useTranslation();
  const out = t("listingScore.caption");
  return (
    <p style={{
      fontFamily: UI, fontWeight: 400, fontSize: "11px", lineHeight: 1.55,
      color: "var(--cr-ink-4)", margin: 0, maxWidth: "72ch", ...style,
    }}>
      {out === "listingScore.caption"
        ? "Measures completeness and internal consistency of the submission. Not a prediction of returns, not investment advice, not a verification of any figure."
        : out}
    </p>
  );
}

export function ScoreWithDisclaimer({
  score,
  dimensions,
  locked = false,
  size = "md",
}: {
  score: number | null;
  /** Omit to render the figure and its caption alone. */
  dimensions?: ScoreDimensionStates;
  /** Paid feature on some plans. The caption still renders: what the figure
   *  means does not depend on whether this viewer may see it. */
  locked?: boolean;
  size?: keyof typeof SIZES;
}) {
  const { t } = useTranslation();
  const tf = (key: string, fallback: string) => {
    const out = t(key);
    return out === key ? fallback : out;
  };
  const dims = SIZES[size];

  const labelStyle: React.CSSProperties = {
    fontFamily: UI, fontWeight: 500, fontSize: dims.label, letterSpacing: "0.1em",
    textTransform: "uppercase", color: "var(--cr-ink-4)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
        <span style={labelStyle}>{tf("listingScore.label", "AI consistency score")}</span>
        {locked ? (
          <span style={{ fontFamily: UI, fontWeight: 500, fontSize: dims.caption, color: "var(--cr-ink-4)" }}>
            {tf("listingScore.locked", "Not shown on your plan")}
          </span>
        ) : score === null || !Number.isFinite(score) ? (
          <span style={{ fontFamily: UI, fontWeight: 500, fontSize: dims.caption, color: "var(--cr-ink-4)" }}>
            {tf("listingScore.none", "Not scored")}
          </span>
        ) : (
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: dims.figure, color: "var(--cr-copper)", fontVariantNumeric: "tabular-nums" }}>
            {Math.round(score)}
            <span style={{ fontSize: "0.55em", color: "var(--cr-ink-4)", fontWeight: 500 }}>/100</span>
          </span>
        )}
      </div>

      {dimensions && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
          {SCORE_DIMENSIONS.map((d) => {
            const stateValue = dimensions[d.key];
            const word =
              stateValue === true ? tf("listingScore.state.present", "Provided")
              : stateValue === false ? tf("listingScore.state.absent", "Not provided")
              : tf("listingScore.state.unknown", "Not established");
            return (
              <li
                key={d.key}
                style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", fontFamily: UI, fontWeight: 300, fontSize: dims.caption, color: "var(--cr-ink-3)" }}
              >
                <span>{tf(`listingScore.dimension.${d.key}`, d.label)}</span>
                <span style={{ color: stateValue === true ? "var(--verdigris)" : "var(--cr-ink-4)", fontWeight: 500 }}>
                  {word}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Renders unconditionally, in every state above including locked and
          unscored. There is no prop that turns this off. */}
      <p style={{ fontFamily: UI, fontWeight: 400, fontSize: dims.caption, lineHeight: 1.55, color: "var(--cr-ink-2)", margin: 0, maxWidth: "56ch" }}>
        {tf(
          "listingScore.caption",
          "Measures completeness and internal consistency of the submission. Not a prediction of returns, not investment advice, not a verification of any figure.",
        )}
      </p>
    </div>
  );
}

export default ScoreWithDisclaimer;
