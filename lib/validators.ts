import { formatCurrency } from "@/lib/utils";
import { MAX_PLAUSIBLE_AMOUNT, MAX_PLAUSIBLE_RUNWAY_MONTHS, safeFormatCurrency } from "@/lib/format";

/**
 * Display-time bounds for startup metrics.
 *
 * Production has already shown why these exist: a listing with a $7 MRR and
 * a 10^17 funding target rendered raw on the browse page. The database
 * accepts what founders type; the display layer refuses to present numbers
 * no real business has. Invalid values render as an em dash -- absent, not
 * wrong.
 */
function isValidMRR(n: number | null | undefined): n is number {
  return n != null && n > 0 && n < 100_000_000; // < $100M monthly
}

export function isValidFundingTarget(n: number | null | undefined): n is number {
  // The ceiling is lib/format's rather than a second copy of it: a card and
  // an aggregate that count the same listing must not disagree about whether
  // its figure is real.
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= MAX_PLAUSIBLE_AMOUNT;
}

export function safeFormatMRR(n: number | null | undefined): string {
  return isValidMRR(n) ? formatCurrency(n, true) : "—";
}

export function safeFormatCurrencyAmount(n: number | null | undefined): string {
  return isValidFundingTarget(n) ? formatCurrency(n, true) : "—";
}

/**
 * A funding target that made it past onboarding but exceeds
 * MAX_PLAUSIBLE_AMOUNT (a 17-digit test value, for instance) collapses to
 * the exact same "—" that safeFormatCurrencyAmount prints for a founder who
 * never set a target at all. A viewer can't tell "not disclosed" from "bad
 * data" from the dash alone -- callers that want to say so (and stop
 * dressing a refused number in the page's one loud accent color) check this
 * first, before the value is gone.
 */
export function isImplausibleFundingTarget(n: number | null | undefined): boolean {
  return typeof n === "number" && Number.isFinite(n) && n > MAX_PLAUSIBLE_AMOUNT;
}

/**
 * Same refuse-don't-render rule as the funding/MRR bounds above, for the one
 * traction figure that never had a ceiling: a 567-month runway is leftover
 * test data, not a real 47-year cash position. Every surface that prints
 * "Nmo runway" checks this first instead of the bare `!= null` it used to.
 */
export function isValidRunwayMonths(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_PLAUSIBLE_RUNWAY_MONTHS;
}

/**
 * Aggregates, which the bounds above cannot judge.
 *
 * A total is a sum of already-bounded rows, so its own ceiling has to scale
 * with how many there are: five plausible $2.5B rounds clear the per-listing
 * bound with nothing wrong anywhere. Judged by that bound, a real month prints
 * as an absence in the Data Centre table while the chart on the next tab plots
 * it -- two surfaces contradicting each other over one number. Raising the
 * per-listing bound would settle that by blinding the guard where 10^17
 * actually enters, so totals get their own bound instead: $10T is some thirty
 * times what global venture deploys in a year, and still far below the values
 * the guard exists to catch.
 */
export const MAX_PLAUSIBLE_TOTAL = 10_000_000_000_000; // < $10T

/** Compact USD for a sum. Zero is a measured total, not a missing one. */
export function safeFormatTotal(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MAX_PLAUSIBLE_TOTAL) return "—";
  if (n === 0) return "$0";
  // Under the per-listing ceiling a total has to read exactly like every other
  // money figure on the page, so the page's own formatter renders it.
  if (n <= MAX_PLAUSIBLE_AMOUNT) return safeFormatCurrency(n);
  const trim = (v: number, d: number) => v.toFixed(d).replace(/\.0$/, "");
  return n >= 1_000_000_000_000
    ? `$${trim(n / 1_000_000_000_000, 1)}T`
    : `$${trim(n / 1_000_000_000, 1)}B`;
}

/**
 * Capital sought across a set of listings, each row bounded before it lands in
 * the sum.
 *
 * Unbounded, a single 10^17 target is the entire total, and the figure above
 * it renders as a dash for a platform that is visibly raising money. Same rule
 * lib/platform-data applies to the monthly capital series, so the same
 * listings cannot produce two different totals on two surfaces.
 */
export function sumFundingTargets(targets: Array<number | null | undefined>): number {
  return targets.reduce<number>((sum, n) => sum + (isValidFundingTarget(n) ? n : 0), 0);
}

/**
 * The same sum for a surface that states it as a fact beside a count.
 *
 * A sum whose inputs were ALL discarded is unknown, not zero. sumFundingTargets
 * answers 0 there, which renders as a literal "$0 being raised" next to "1
 * active round" -- the page asserting that a round is open and no capital is
 * sought, while the median and the card beside it correctly show an absence.
 * Null instead, which every money formatter here already renders as the dash.
 *
 * An empty input is the OTHER case and stays 0: nothing was discarded, no
 * listings at all is a measured zero, and the surface's own empty state is what
 * speaks for it.
 *
 * Kept beside sumFundingTargets rather than replacing it: a chart axis and a
 * running total want the number, and both must judge a row by the same bound.
 */
export function sumPlausibleFundingTargets(
  targets: Array<number | null | undefined>,
): number | null {
  if (targets.length === 0) return 0;
  const usable = targets.filter(isValidFundingTarget);
  if (usable.length === 0) return null;
  return usable.reduce<number>((sum, n) => sum + n, 0);
}

/**
 * The y-axis ceiling for a chart, rounded up to a number a person would say.
 *
 * Every series in a frame shares one scale, which makes one bad value
 * everyone's problem: a single NaN takes the ceiling to NaN, and from there to
 * 1, with every real point off the top of the frame. Magnitude is deliberately
 * not judged -- a chart cannot know whether 10^17 is a bad row or a real count,
 * and the surface that supplies the numbers is the one that can.
 *
 * Lives in lib rather than beside the chart because the test harness cannot
 * import a .tsx.
 */
export function plotCeiling(values: number[]): number {
  const rawMax = Math.max(1, ...values.filter(v => Number.isFinite(v)));
  const step = Math.pow(10, Math.floor(Math.log10(rawMax)));
  return Math.ceil(rawMax / step) * step || 1;
}
