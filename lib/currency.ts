// ── Currency catalog ──────────────────────────────────────────────────────────
// Central definition of every currency the platform accepts on a deal.
// `code` is the ISO 4217 code stored in the DB; `symbol`/`name` are for display.

export type CurrencyCode =
  | "USD" | "EUR" | "GBP" | "CHF" | "CAD" | "AUD"
  | "JPY" | "SGD" | "INR" | "AED";

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  name: string;
  /** ISO 4217 currencies with zero minor units (no decimals) — JPY. */
  zeroDecimal?: boolean;
}

export const CURRENCIES: Currency[] = [
  { code: "USD", symbol: "$",   name: "US Dollar" },
  { code: "EUR", symbol: "€",   name: "Euro" },
  { code: "GBP", symbol: "£",   name: "British Pound" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$",  name: "Australian Dollar" },
  { code: "JPY", symbol: "¥",   name: "Japanese Yen", zeroDecimal: true },
  { code: "SGD", symbol: "S$",  name: "Singapore Dollar" },
  { code: "INR", symbol: "₹",   name: "Indian Rupee" },
  { code: "AED", symbol: "AED", name: "UAE Dirham" },
];

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === "string" && BY_CODE.has(v as CurrencyCode);
}

export function getCurrency(code: string | null | undefined): Currency {
  return (code && BY_CODE.get(code as CurrencyCode)) || BY_CODE.get(DEFAULT_CURRENCY)!;
}

// ── Formatting ────────────────────────────────────────────────────────────────
// `formatMoney` renders an amount in a given currency. When `compact` is set it
// abbreviates large numbers (e.g. €1.2M, ¥5.4B) using the currency's own symbol.

export function formatMoney(
  amount: number,
  code: string | null | undefined = DEFAULT_CURRENCY,
  opts: { compact?: boolean } = {},
): string {
  const cur = getCurrency(code);

  if (opts.compact) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    if (abs >= 1_000_000_000) return `${sign}${cur.symbol}${trim(abs / 1_000_000_000)}B`;
    if (abs >= 1_000_000)     return `${sign}${cur.symbol}${trim(abs / 1_000_000)}M`;
    if (abs >= 1_000)         return `${sign}${cur.symbol}${Math.round(abs / 1_000)}k`;
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur.code,
      maximumFractionDigits: cur.zeroDecimal ? 0 : 0,
    }).format(amount);
  } catch {
    // Fallback if the runtime doesn't know the currency code
    return `${cur.symbol}${Math.round(amount).toLocaleString()}`;
  }
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}
