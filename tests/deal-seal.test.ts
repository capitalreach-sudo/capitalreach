import { describe, it, expect } from "vitest";
import { dealSealText, sealHash, DEAL_SEAL_VERSION } from "../lib/deal-seal";
import { SUCCESS_FEE_PERCENT, NON_CIRCUMVENTION_MONTHS } from "../lib/circumvention-text";

/**
 * The seal is evidence for a fee invoiced months later, so the tests that
 * matter are the ones about reproducibility: the same terms must always
 * produce the same bytes, and different terms must never produce the same
 * hash. Everything else is wording.
 */

/** The document is hard-wrapped for reading, so phrases span line breaks. */
const flat = (t: string) => t.replace(/\s+/g, " ");

const BASE = {
  companyName: "Verity Grid",
  investorName: "Northgate Partners",
  amount: 250_000,
  currency: "USD",
  equityPct: 4,
  valuation: 6_000_000,
  instrument: "SAFE",
  conditions: "Pro-rata rights; monthly reporting.",
  introducedAt: "2026-09-01T10:00:00Z",
  tailEndsAt: "2028-09-01T10:00:00Z",
};

describe("dealSealText", () => {
  it("names both parties and every term that was agreed", () => {
    const t = dealSealText(BASE);
    expect(t).toContain("Verity Grid");
    expect(t).toContain("Northgate Partners");
    expect(t).toContain("USD 250,000");
    expect(t).toContain("4%");
    expect(t).toContain("USD 6,000,000");
    expect(t).toContain("SAFE");
    expect(t).toContain("Pro-rata rights");
  });

  it("states the fee and the tail from the constants, not from prose", () => {
    const t = dealSealText(BASE);
    expect(t).toContain(`${SUCCESS_FEE_PERCENT}% success fee`);
    expect(t).toContain(`${NON_CIRCUMVENTION_MONTHS} months`);
  });

  it("renders dates as ISO days, never locale-formatted", () => {
    const t = dealSealText(BASE);
    expect(t).toContain("2026-09-01");
    expect(t).toContain("2028-09-01");
    expect(t).not.toMatch(/September|Sept\b|01\/09\/2026/);
  });

  it("says the fee is charged to the company and never to the investor", () => {
    const t = flat(dealSealText(BASE));
    expect(t).toContain("charged to the Company");
    expect(t).toContain("never charged to the Investor");
  });

  it("says plainly that the terms are not binding, so the gate is not a trap", () => {
    // A founder asked to sign before they may talk must be able to read, in
    // the document itself, that signing does not commit them to the round.
    const t = flat(dealSealText(BASE));
    expect(t).toMatch(/not final investment documents/i);
    expect(t).toMatch(/renegotiate/i);
  });

  it("gives CapitalReach a right to evidence of the closed amount", () => {
    // The fee is charged to a company that has by then raised money and moved
    // on. Without a right to ask, an understated figure is unanswerable.
    const t = flat(dealSealText(BASE));
    expect(t).toMatch(/produce ordinary evidence of that figure/i);
    expect(t).toMatch(/share allotment|companies registry/i);
    expect(t).toMatch(/no more than once per round/i);
  });

  it("says what an understated figure costs, and what does NOT count as one", () => {
    const t = flat(dealSealText(BASE));
    expect(t).toMatch(/materially understated/i);
    expect(t).toMatch(/reasonable cost of establishing it/i);
    // The carve-out matters as much as the teeth: rounds shrink, and a smaller
    // close is not a lie. Without this the clause would read as a trap.
    expect(t).toMatch(/not understated because the round closed smaller/i);
  });

  it("promises not to publish what the evidence right produces", () => {
    expect(flat(dealSealText(BASE))).toMatch(/confidential under clause 6 and will not publish it/i);
  });

  it("carries the carve-out, since a term with none gets read down entirely", () => {
    expect(flat(dealSealText(BASE))).toMatch(/predates the recorded introduction date/i);
  });

  it("omits terms that were never agreed rather than printing null", () => {
    const t = dealSealText({
      companyName: "Verity Grid", investorName: "An angel",
      amount: 50_000, currency: "EUR",
    });
    expect(t).toContain("EUR 50,000");
    expect(t).not.toContain("null");
    expect(t).not.toContain("undefined");
    expect(t).not.toMatch(/Equity:/);
    expect(t).not.toMatch(/Instrument:/);
  });

  it("survives a missing amount without claiming a number", () => {
    const t = dealSealText({ companyName: "X", investorName: "Y", amount: null, currency: null });
    expect(t).toContain("an amount to be agreed");
    expect(t).not.toContain("NaN");
  });

  it("falls back to described dates when no introduction is on record", () => {
    const t = dealSealText({ companyName: "X", investorName: "Y", amount: 1, currency: "GBP" });
    expect(t).toContain("the date of first contact recorded by CapitalReach");
    expect(t).toContain(`${NON_CIRCUMVENTION_MONTHS} months after that date`);
  });
});

describe("sealHash", () => {
  it("is stable for identical terms", () => {
    expect(sealHash(dealSealText(BASE))).toBe(sealHash(dealSealText(BASE)));
  });

  it("changes when ANY term changes -- this is the whole point", () => {
    const base = sealHash(dealSealText(BASE));
    const cases = [
      { ...BASE, amount: 250_001 },
      { ...BASE, equityPct: 4.5 },
      { ...BASE, valuation: 6_000_001 },
      { ...BASE, instrument: "Priced equity" },
      { ...BASE, conditions: "Pro-rata rights only." },
      { ...BASE, companyName: "Verity Grid Ltd" },
      { ...BASE, investorName: "Northgate Partners II" },
      { ...BASE, introducedAt: "2026-09-02T10:00:00Z" },
    ];
    for (const c of cases) {
      expect(sealHash(dealSealText(c)), JSON.stringify(c).slice(0, 60)).not.toBe(base);
    }
  });

  it("is a sha256 hex digest", () => {
    expect(sealHash(dealSealText(BASE))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("DEAL_SEAL_VERSION", () => {
  it("is an ISO day, so a signature can be tied to wording by date", () => {
    expect(DEAL_SEAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
