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

/**
 * The signed figure as the primary reference.
 *
 * What somebody typed in a chat is an argument: people write "we're raising
 * 2M" about the whole round rather than about this cheque, which is why the
 * message-based check is deliberately generous. A number both parties
 * countersigned is not ambiguous in the same way, so it is checked first and,
 * once sealed, raised to high.
 */
describe("amountLooksUnderstated against the agreed figure", () => {
  it("flags a close an order of magnitude below a SEALED agreement, at high", () => {
    const f = amountLooksUnderstated({
      closedAmount: 50, fundingTarget: 1_200_000, largestMentioned: null,
      agreedAmount: 300_000, agreedIsSealed: true,
    });
    expect(f?.understated).toBe(true);
    expect(f?.severity).toBe("high");
    expect(f?.detail.against).toBe("sealed_record");
  });

  it("flags the same gap at medium when the record was never countersigned", () => {
    const f = amountLooksUnderstated({
      closedAmount: 50, fundingTarget: 1_200_000, largestMentioned: null,
      agreedAmount: 300_000, agreedIsSealed: false,
    });
    expect(f?.severity).toBe("medium");
    expect(f?.detail.against).toBe("accepted_offer");
  });

  it("does not flag a round that closed smaller for ordinary reasons", () => {
    // Agreed 300k, closed 200k. Rounds shrink; that is not fraud.
    expect(amountLooksUnderstated({
      closedAmount: 200_000, fundingTarget: 1_200_000, largestMentioned: null,
      agreedAmount: 300_000, agreedIsSealed: true,
    })).toBeNull();
  });

  it("does not flag a close LARGER than the agreement", () => {
    expect(amountLooksUnderstated({
      closedAmount: 400_000, fundingTarget: 1_200_000, largestMentioned: null,
      agreedAmount: 300_000, agreedIsSealed: true,
    })).toBeNull();
  });

  it("still works with no agreed figure at all, which is every legacy deal", () => {
    const f = amountLooksUnderstated({
      closedAmount: 50, fundingTarget: null, largestMentioned: 2_000_000,
      agreedAmount: null, agreedIsSealed: false,
    });
    expect(f?.understated).toBe(true);
    expect(f?.detail.against).toBe("messages");
  });

  it("returns nothing when there is no close amount to judge", () => {
    expect(amountLooksUnderstated({
      closedAmount: null, fundingTarget: 1_000_000, largestMentioned: null,
      agreedAmount: 300_000, agreedIsSealed: true,
    })).toBeNull();
  });
});
