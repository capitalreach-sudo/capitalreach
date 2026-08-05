import { formatCurrency } from "@/lib/utils";

/**
 * Display-time bounds for startup metrics.
 *
 * Production has already shown why these exist: a listing with a $7 MRR and
 * a 10^17 funding target rendered raw on the browse page. The database
 * accepts what founders type; the display layer refuses to present numbers
 * no real business has. Invalid values render as an em dash -- absent, not
 * wrong.
 */
export function isValidMRR(n: number | null | undefined): n is number {
  return n != null && n > 0 && n < 100_000_000; // < $100M monthly
}

export function isValidFundingTarget(n: number | null | undefined): n is number {
  return n != null && n > 0 && n < 10_000_000_000; // < $10B
}

export function isValidCompanyName(s: string | null | undefined): boolean {
  return s != null && s.trim().length >= 2;
}

export function safeFormatMRR(n: number | null | undefined): string {
  return isValidMRR(n) ? formatCurrency(n, true) : "—";
}

export function safeFormatCurrencyAmount(n: number | null | undefined): string {
  return isValidFundingTarget(n) ? formatCurrency(n, true) : "—";
}
