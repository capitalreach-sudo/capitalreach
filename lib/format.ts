/**
 * Display-layer safety net for numbers.
 *
 * Every money figure that reaches a screen should pass through one of the
 * `safe*` helpers. They refuse to render implausible values ("$100000000B"
 * came from a test listing with a 17-digit funding target) and render "—"
 * instead — the caller never has to remember to guard. Test data stays in
 * the database untouched; it simply can't reach the page as garbage.
 */

/** Anything above this is not a real startup number — it's bad data. */
export const MAX_PLAUSIBLE_AMOUNT = 9_999_999_999; // < $10B
/** MRR above this is not a real MRR either. */
export const MAX_PLAUSIBLE_MRR = 100_000_000; // < $100M / month

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function compact(n: number, symbol: string): string {
  const trim = (v: number, d: number) => v.toFixed(d).replace(/\.0$/, "");
  if (n >= 1_000_000_000) return `${symbol}${trim(n / 1_000_000_000, 1)}B`;
  if (n >= 1_000_000)     return `${symbol}${trim(n / 1_000_000, 1)}M`;
  if (n >= 1_000)         return `${symbol}${Math.round(n / 1_000)}k`;
  return `${symbol}${Math.round(n).toLocaleString("en-US")}`;
}

/** Compact USD; "—" for null / non-positive / implausible values. */
export function safeFormatCurrency(n: number | null | undefined): string {
  if (!isFiniteNumber(n) || n <= 0 || n > MAX_PLAUSIBLE_AMOUNT) return "—";
  return compact(n, "$");
}

/** Compact EUR with the same guards. */
export function safeFormatEuro(n: number | null | undefined): string {
  if (!isFiniteNumber(n) || n <= 0 || n > MAX_PLAUSIBLE_AMOUNT) return "—";
  return compact(n, "€");
}

/** MRR: 0 is a real answer (pre-revenue), null/implausible is "—". */
export function safeFormatMRR(n: number | null | undefined): string {
  if (!isFiniteNumber(n) || n < 0 || n > MAX_PLAUSIBLE_MRR) return "—";
  if (n === 0) return "Pre-revenue";
  return compact(n, "$");
}

/**
 * Legacy name kept for existing imports. Same guards as safeFormatCurrency
 * so nothing that still calls formatCurrency can print a 17-digit "B".
 */
export function formatCurrency(n: number | null | undefined): string {
  return safeFormatCurrency(n);
}

/** Signed percentage, one decimal; "—" for null. */
export function formatPercent(n: number | null | undefined): string {
  if (!isFiniteNumber(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/**
 * Dates. Default: "12 Aug" this year, "12 Aug 2025" otherwise.
 * `{ relative: true }`: "just now" / "3h ago" / "2w ago" …
 */
export function formatDate(
  d: string | Date | null | undefined,
  opts: { relative?: boolean } = {},
): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";

  if (opts.relative) {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  }

  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}
