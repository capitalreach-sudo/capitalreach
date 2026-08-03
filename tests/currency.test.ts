import { describe, it, expect } from "vitest";
import { isCurrencyCode, getCurrency, formatMoney, DEFAULT_CURRENCY, CURRENCIES } from "@/lib/currency";

describe("currency", () => {
  it("recognises every listed code and rejects garbage", () => {
    for (const c of CURRENCIES) expect(isCurrencyCode(c.code)).toBe(true);
    expect(isCurrencyCode("usd")).toBe(false);
    expect(isCurrencyCode("")).toBe(false);
    expect(isCurrencyCode(null)).toBe(false);
    expect(isCurrencyCode(42)).toBe(false);
  });
  it("getCurrency falls back to the default for unknowns", () => {
    expect(getCurrency("XXX").code).toBe(DEFAULT_CURRENCY);
    expect(getCurrency(null).code).toBe(DEFAULT_CURRENCY);
  });
  it("formatMoney produces a symbol and grouped number", () => {
    const s = formatMoney(1250000, "USD");
    expect(s).toMatch(/\$/);
    expect(s).toMatch(/1[.,]?2/);
  });
});
