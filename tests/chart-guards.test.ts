import { describe, it, expect } from "vitest";
import { buildMonthlySeries } from "@/lib/platform-data";
import { MAX_PLAUSIBLE_TOTAL, plotCeiling, safeFormatTotal, sumFundingTargets } from "@/lib/validators";

/** The placeholder the display layer renders for a figure it will not claim. */
const ABSENT = "—";

describe("plotCeiling", () => {
  it("rounds up to a number a person would say", () => {
    expect(plotCeiling([120, 340])).toBe(400);
    expect(plotCeiling([7, 3])).toBe(7);
  });

  it("survives an empty or all-zero series", () => {
    expect(plotCeiling([])).toBe(1);
    expect(plotCeiling([0, 0, 0])).toBe(1);
  });

  it("ignores a non-finite value instead of collapsing the scale to 1", () => {
    // The unguarded form is Math.max(1, ...values): one NaN makes the ceiling
    // NaN, which falls through to 1 and throws every real point off the frame.
    expect(plotCeiling([NaN, 3, 7])).toBe(7);
    expect(plotCeiling([Infinity, 500])).toBe(500);
    expect(plotCeiling([NaN, Infinity])).toBe(1);
  });

  it("does not judge magnitude -- that belongs to whoever supplies the data", () => {
    expect(plotCeiling([1e17, 5])).toBe(1e17);
  });
});

describe("safeFormatTotal", () => {
  it("prints a zero total rather than an absence", () => {
    expect(safeFormatTotal(0)).toBe("$0");
  });

  it("reads like every other money figure below the per-listing ceiling", () => {
    expect(safeFormatTotal(500_000)).toBe("$500k");
    expect(safeFormatTotal(2_400_000)).toBe("$2.4M");
  });

  it("renders a month that legitimately sums past the per-listing ceiling", () => {
    // Five plausible rounds, nothing wrong with any of them.
    expect(safeFormatTotal(12_500_000_000)).toBe("$12.5B");
    expect(safeFormatTotal(2_500_000_000_000)).toBe("$2.5T");
    expect(safeFormatTotal(MAX_PLAUSIBLE_TOTAL)).toBe("$10T");
  });

  it("still refuses what no sum of real rounds could reach", () => {
    expect(safeFormatTotal(1e17)).toBe(ABSENT);
    expect(safeFormatTotal(NaN)).toBe(ABSENT);
    expect(safeFormatTotal(Infinity)).toBe(ABSENT);
    expect(safeFormatTotal(-5)).toBe(ABSENT);
    expect(safeFormatTotal(null)).toBe(ABSENT);
    expect(safeFormatTotal(undefined)).toBe(ABSENT);
  });
});

describe("sumFundingTargets", () => {
  it("drops the rows the display layer would refuse to print", () => {
    expect(sumFundingTargets([1e17, 2_000_000, null, undefined, 0, -5, NaN])).toBe(2_000_000);
  });

  it("keeps a large but plausible total printable", () => {
    const total = sumFundingTargets([5_000_000_000, 5_000_000_000, 2_000_000_000]);
    expect(total).toBe(12_000_000_000);
    expect(safeFormatTotal(total)).toBe("$12B");
  });

  it("agrees with the monthly capital series on the same listings", () => {
    // The homepage tile and the Data Centre count the same rows; if these two
    // bounds ever drift apart the two surfaces report different totals.
    const targets = [750_000, 1e17, null, 0, 4_000_000];
    const months = buildMonthlySeries(
      new Date("2026-09-15T12:00:00Z"),
      targets.map(funding_target => ({ created_at: "2026-09-04T00:00:00Z", funding_target })),
      [],
    );
    expect(months[11].sought).toBe(sumFundingTargets(targets));
  });
});
