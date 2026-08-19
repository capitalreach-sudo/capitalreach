/**
 * D44: round arithmetic.
 *
 * The listing showed "raising €500k for 8%" and left every investor to work
 * out what that implies — and nothing checked that the two numbers agree.
 * These are the derivations, kept pure so the listing, the edit form and
 * the tests all compute the same thing.
 *
 * Everything returns null rather than guessing: a missing valuation is a
 * missing valuation, not a zero.
 */
export type ValuationType = "pre" | "post";
export type Instrument = "equity" | "safe" | "convertible_note";

export interface RoundInputs {
  raise?: number | null;              // funding_target
  equityOffered?: number | null;      // percent, 0–100
  valuation?: number | null;
  valuationType?: ValuationType | null;
}

const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Post-money from whichever valuation was given. */
export function postMoney({ raise, valuation, valuationType }: RoundInputs): number | null {
  if (!ok(valuation)) return null;
  if (valuationType === "post") return valuation;
  if (valuationType === "pre") return ok(raise) ? valuation + raise : null;
  return null;
}

export function preMoney(inputs: RoundInputs): number | null {
  const post = postMoney(inputs);
  if (post === null) return null;
  return ok(inputs.raise) ? post - inputs.raise : post;
}

/** Dilution this round implies, as a percentage of post-money. */
export function impliedDilutionPct(inputs: RoundInputs): number | null {
  const post = postMoney(inputs);
  if (post === null || !ok(inputs.raise)) return null;
  return (inputs.raise / post) * 100;
}

/** What one cheque buys, as a percentage of the company. */
export function ownershipForCheque(cheque: number, inputs: RoundInputs): number | null {
  const post = postMoney(inputs);
  if (post === null || !ok(cheque)) return null;
  return (cheque / post) * 100;
}

/** The valuation the stated equity implies, when no valuation was given. */
export function impliedPostFromEquity({ raise, equityOffered }: RoundInputs): number | null {
  if (!ok(raise) || !ok(equityOffered) || equityOffered >= 100) return null;
  return raise / (equityOffered / 100);
}

/**
 * Does the stated equity agree with the stated valuation? Returns the gap in
 * percentage points, or null when either side is missing. Anything beyond
 * about half a point is worth surfacing to the founder — investors will do
 * this arithmetic anyway, and it is better to catch it before they do.
 */
export function equityValuationMismatch(inputs: RoundInputs): number | null {
  const dilution = impliedDilutionPct(inputs);
  if (dilution === null || !ok(inputs.equityOffered)) return null;
  return Math.abs(dilution - inputs.equityOffered);
}

/** Investor allocation for a period: target vs what is already spoken for. */
export function allocationSummary(target: number | null | undefined, committed: number, deployed: number) {
  const t = ok(target) ? target : null;
  const remaining = t === null ? null : Math.max(0, t - committed - deployed);
  const usedPct = t === null ? null : Math.min(100, ((committed + deployed) / t) * 100);
  return { target: t, committed, deployed, remaining, usedPct };
}
