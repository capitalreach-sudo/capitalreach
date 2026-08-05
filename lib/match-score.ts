/**
 * How well a listing fits an investor's stated thesis, 0–100.
 *
 * Deterministic and rule-based on purpose: no model call, so it costs
 * nothing, cannot be rate-limited, returns instantly, and — the part that
 * matters for trust — always explains itself the same way twice. The
 * breakdown is returned alongside the score so the UI can say *why*.
 *
 * The five weights sum to 100. An investor who has filled in nothing scores
 * every listing at its score bonus alone, which is the honest answer: with
 * no thesis there is no fit signal.
 */
export interface InvestorThesis {
  stages?: string[] | null;
  industries?: string[] | null;
  geography?: string[] | null;
  min_check?: number | null;
  max_check?: number | null;
}

export interface MatchBreakdown {
  score: number;
  stage: boolean;
  industry: boolean;
  geography: boolean;
  checkSize: boolean;
}

export function computeMatchScore(
  investor: InvestorThesis,
  // Structural on purpose: every surface that lists startups (browse rows,
  // card data, raw query rows) satisfies this without casting.
  startup: {
    stage: string;
    industry: string;
    funding_target: number;
    vaultrise_score: number | null;
    country?: string | null;
    target_markets?: string[] | null;
  },
): MatchBreakdown {
  let score = 0;

  const stage = !!investor.stages?.includes(startup.stage);
  if (stage) score += 20;

  const industry = !!investor.industries?.includes(startup.industry);
  if (industry) score += 25;

  // Either the listing's home country or any market it targets.
  const geography =
    !!investor.geography?.length &&
    (
      (!!startup.country && investor.geography.includes(startup.country)) ||
      (startup.target_markets ?? []).some((m) => investor.geography!.includes(m))
    );
  if (geography) score += 15;

  // A round is reachable if the investor's ceiling could plausibly take part:
  // a €100k cheque belongs in a €1M round, so the ceiling is compared at 10x.
  const checkSize =
    investor.min_check != null &&
    investor.max_check != null &&
    startup.funding_target > 0 &&
    startup.funding_target >= investor.min_check &&
    startup.funding_target <= investor.max_check * 10;
  if (checkSize) score += 20;

  if (startup.vaultrise_score != null) {
    score += Math.round((startup.vaultrise_score / 100) * 20);
  }

  return { score: Math.min(score, 100), stage, industry, geography, checkSize };
}
