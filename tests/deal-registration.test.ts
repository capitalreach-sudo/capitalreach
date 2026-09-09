import { describe, it, expect } from "vitest";
import { amountsMentioned, amountLooksUnderstated } from "../lib/deal-registration";

/**
 * The understatement lead is the most dangerous thing in this file: it points
 * at somebody and says "look here". A false positive costs a real founder an
 * accusation, so the bar is deliberately high and these tests hold it there.
 */
describe("amountsMentioned", () => {
  it("reads the shorthand people actually type", () => {
    expect(amountsMentioned("we're raising 2M this round")).toContain(2_000_000);
    expect(amountsMentioned("about 500k so far")).toContain(500_000);
    expect(amountsMentioned("1.5m committed")).toContain(1_500_000);
  });

  it("reads grouped figures with a currency mark", () => {
    expect(amountsMentioned("the round is €1,500,000")).toContain(1_500_000);
  });

  it("returns largest first", () => {
    expect(amountsMentioned("250k now, 2M total")[0]).toBe(2_000_000);
  });

  it("does not turn years or small counts into money", () => {
    expect(amountsMentioned("founded in 2019 with 12 people")).toEqual([]);
  });

  it("is empty on ordinary conversation", () => {
    expect(amountsMentioned("Happy to jump on a call Thursday.")).toEqual([]);
  });
});

describe("amountLooksUnderstated", () => {
  it("says nothing about a normal slice of a larger round", () => {
    // Talking about a 2M round, taking 200k of it. The everyday case.
    expect(amountLooksUnderstated({
      closedAmount: 200_000, fundingTarget: 2_000_000, largestMentioned: 2_000_000,
    })).toBeNull();
  });

  it("says nothing when the close is near the advertised round", () => {
    expect(amountLooksUnderstated({
      closedAmount: 1_800_000, fundingTarget: 2_000_000, largestMentioned: 2_000_000,
    })).toBeNull();
  });

  it("flags a close two orders below the conversation AND the round", () => {
    const f = amountLooksUnderstated({
      closedAmount: 20_000, fundingTarget: 2_000_000, largestMentioned: 2_000_000,
    });
    expect(f?.understated).toBe(true);
    expect(f?.detail.ratio).toBe(100);
  });

  it("stays silent with nothing to compare against", () => {
    expect(amountLooksUnderstated({ closedAmount: 20_000, fundingTarget: null, largestMentioned: null })).toBeNull();
    expect(amountLooksUnderstated({ closedAmount: null, fundingTarget: 2_000_000, largestMentioned: 2_000_000 })).toBeNull();
  });

  it("stays silent on a zero or negative close", () => {
    expect(amountLooksUnderstated({ closedAmount: 0, fundingTarget: 1_000_000, largestMentioned: 1_000_000 })).toBeNull();
  });
});
