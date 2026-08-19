/**
 * C27: the investor's own scorecard. Five criteria, 0–5 each, with an
 * optional weight per criterion (default 1) so a thesis that cares mostly
 * about the team can say so. Total is normalised to 0–100 across only the
 * criteria that were actually scored — a half-filled card reports the
 * average of what you judged, not a penalty for what you skipped.
 */
export const SCORECARD_CRITERIA = ["team", "market", "product", "traction", "terms"] as const;
export type ScorecardCriterion = typeof SCORECARD_CRITERIA[number];
export type ScorecardScores = Partial<Record<ScorecardCriterion, number>>;
export type ScorecardWeights = Partial<Record<ScorecardCriterion, number>>;

export const CRITERION_LABEL_KEY: Record<ScorecardCriterion, string> = {
  team: "scorecard.team",
  market: "scorecard.market",
  product: "scorecard.product",
  traction: "scorecard.traction",
  terms: "scorecard.terms",
};

export function sanitizeScores(input: unknown): ScorecardScores {
  const out: ScorecardScores = {};
  if (!input || typeof input !== "object") return out;
  for (const k of SCORECARD_CRITERIA) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 5) out[k] = Math.round(v);
  }
  return out;
}

export function sanitizeWeights(input: unknown): ScorecardWeights {
  const out: ScorecardWeights = {};
  if (!input || typeof input !== "object") return out;
  for (const k of SCORECARD_CRITERIA) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 5) out[k] = Math.round(v);
  }
  return out;
}

/** 0–100 over the scored criteria only; null when nothing is scored yet. */
export function scorecardTotal(scores: ScorecardScores, weights: ScorecardWeights = {}): number | null {
  let num = 0, den = 0;
  for (const k of SCORECARD_CRITERIA) {
    const s = scores[k];
    if (s === undefined) continue;
    const w = weights[k] ?? 1;
    if (w <= 0) continue;
    num += s * w;
    den += 5 * w;
  }
  if (den === 0) return null;
  return Math.round((num / den) * 100);
}
