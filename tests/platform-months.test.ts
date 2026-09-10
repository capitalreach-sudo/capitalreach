import { describe, it, expect } from "vitest";
import { buildMonthlySeries } from "@/lib/platform-data";

const NOW = new Date("2026-09-15T12:00:00Z");

describe("buildMonthlySeries", () => {
  it("returns twelve calendar months even with nothing to report", () => {
    const months = buildMonthlySeries(NOW, [], []);
    expect(months).toHaveLength(12);
    expect(months[0].month).toBe("2025-10");
    expect(months[11].month).toBe("2026-09");
    expect(months.every(m => m.listings === 0 && m.closed === 0 && m.sought === 0)).toBe(true);
  });

  it("counts a listing with no stated target without adding to the capital line", () => {
    const months = buildMonthlySeries(
      NOW,
      [
        { created_at: "2026-09-02T00:00:00Z", funding_target: null },
        { created_at: "2026-09-03T00:00:00Z", funding_target: 0 },
        { created_at: "2026-09-04T00:00:00Z", funding_target: 500_000 },
      ],
      [],
    );
    const sep = months[11];
    expect(sep.listings).toBe(3);
    expect(sep.sought).toBe(500_000);
  });

  it("never emits NaN or Infinity from an all-null month", () => {
    const months = buildMonthlySeries(
      NOW,
      [
        { created_at: "2026-08-02T00:00:00Z", funding_target: null },
        { created_at: "2026-08-09T00:00:00Z", funding_target: null },
      ],
      [],
    );
    expect(months.every(m => Number.isFinite(m.sought))).toBe(true);
    expect(months[10].sought).toBe(0);
  });

  it("drops an implausible target instead of letting it set the y-scale", () => {
    // A 10^17 target has reached production before. Summed into a month it
    // makes every other month unreadable against it, and the table beside the
    // chart shows an absence dash for the same number.
    const months = buildMonthlySeries(
      NOW,
      [
        { created_at: "2026-04-02T00:00:00Z", funding_target: 1e17 },
        { created_at: "2026-05-02T00:00:00Z", funding_target: 750_000 },
        { created_at: "2026-06-02T00:00:00Z", funding_target: 1_200_000 },
      ],
      [],
    );
    const peak = Math.max(...months.map(m => m.sought));
    expect(peak).toBe(1_200_000);
    expect(months[6].listings).toBe(1);
    expect(months[6].sought).toBe(0);
  });

  it("keeps a genuinely large round visible", () => {
    const months = buildMonthlySeries(
      NOW,
      [{ created_at: "2026-07-02T00:00:00Z", funding_target: 80_000_000 }],
      [],
    );
    expect(months[9].sought).toBe(80_000_000);
  });

  it("ignores rows outside the window and rows with no date", () => {
    const months = buildMonthlySeries(
      NOW,
      [
        { created_at: "2019-01-02T00:00:00Z", funding_target: 900_000 },
        { created_at: null, funding_target: 900_000 },
      ],
      [{ closed_at: null }, { closed_at: "2026-09-20T00:00:00Z" }],
    );
    expect(months.reduce((n, m) => n + m.listings, 0)).toBe(0);
    expect(months.reduce((n, m) => n + m.sought, 0)).toBe(0);
    expect(months[11].closed).toBe(1);
  });

  it("crosses the year boundary without repeating a month key", () => {
    const months = buildMonthlySeries(new Date("2026-01-05T00:00:00Z"), [], []);
    expect(months[0].month).toBe("2025-02");
    expect(months[11].month).toBe("2026-01");
    expect(new Set(months.map(m => m.month)).size).toBe(12);
  });
});
