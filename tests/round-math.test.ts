import { describe, it, expect } from "vitest";
import {
  postMoney, preMoney, impliedDilutionPct, ownershipForCheque,
  impliedPostFromEquity, equityValuationMismatch, allocationSummary,
} from "@/lib/round-math";

describe("round math (D44)", () => {
  it("derives post-money from a pre-money valuation and the raise", () => {
    expect(postMoney({ raise: 500_000, valuation: 4_500_000, valuationType: "pre" })).toBe(5_000_000);
    expect(postMoney({ raise: 500_000, valuation: 5_000_000, valuationType: "post" })).toBe(5_000_000);
  });

  it("returns null rather than guessing when inputs are missing", () => {
    expect(postMoney({ raise: 500_000, valuation: null, valuationType: "pre" })).toBeNull();
    expect(postMoney({ raise: null, valuation: 4_500_000, valuationType: "pre" })).toBeNull();
    expect(impliedDilutionPct({ raise: 500_000 })).toBeNull();
    expect(ownershipForCheque(50_000, {})).toBeNull();
  });

  it("round-trips pre → post → pre", () => {
    const inputs = { raise: 500_000, valuation: 4_500_000, valuationType: "pre" as const };
    expect(preMoney(inputs)).toBe(4_500_000);
  });

  it("computes dilution and per-cheque ownership off post-money", () => {
    const inputs = { raise: 500_000, valuation: 5_000_000, valuationType: "post" as const };
    expect(impliedDilutionPct(inputs)).toBeCloseTo(10, 6);
    expect(ownershipForCheque(50_000, inputs)).toBeCloseTo(1, 6);
  });

  it("infers the post-money a stated equity implies", () => {
    expect(impliedPostFromEquity({ raise: 500_000, equityOffered: 10 })).toBe(5_000_000);
    expect(impliedPostFromEquity({ raise: 500_000, equityOffered: 0 })).toBeNull();
    expect(impliedPostFromEquity({ raise: 500_000, equityOffered: 100 })).toBeNull();
  });

  it("flags equity that contradicts the stated valuation", () => {
    // 500k on a 5M post is 10% — saying 8% is a two-point contradiction.
    const gap = equityValuationMismatch({ raise: 500_000, valuation: 5_000_000, valuationType: "post", equityOffered: 8 });
    expect(gap).toBeCloseTo(2, 6);
    // Consistent numbers report no meaningful gap.
    expect(equityValuationMismatch({ raise: 500_000, valuation: 5_000_000, valuationType: "post", equityOffered: 10 })).toBeCloseTo(0, 6);
  });

  it("summarises allocation without letting remaining go negative", () => {
    expect(allocationSummary(1_000_000, 200_000, 300_000)).toMatchObject({ remaining: 500_000, usedPct: 50 });
    expect(allocationSummary(100_000, 80_000, 50_000).remaining).toBe(0);
    expect(allocationSummary(null, 0, 0)).toMatchObject({ target: null, remaining: null, usedPct: null });
  });
});
