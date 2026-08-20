import { describe, it, expect } from "vitest";
import { computeBenchmarks, percentileAmong, MIN_PEERS } from "@/lib/benchmarks";

const peer = (mrr: number | null, growth = null as number | null) =>
  ({ mrr, growth_rate: growth, runway_months: null, vaultrise_score: null });

describe("percentiles", () => {
  it("counts only peers strictly below, so ties are not flattered", () => {
    // Three companies on identical MRR: each is p0 among the others, not
    // "above average".
    expect(percentileAmong(100, [100, 100])).toBe(0);
    expect(percentileAmong(100, [50, 100, 150])).toBe(33);
  });

  it("puts the top of a cohort at p100 and the bottom at p0", () => {
    expect(percentileAmong(200, [50, 100, 150])).toBe(100);
    expect(percentileAmong(10, [50, 100, 150])).toBe(0);
  });
});

describe("benchmark assembly", () => {
  it("ranks each metric only among peers who disclosed it", () => {
    // Five disclose MRR, two leave it blank. The blanks are absent from the
    // comparison, not zeros to beat.
    const cohort = [peer(10), peer(20), peer(30), peer(40), peer(50), peer(null), peer(null)];
    const r = computeBenchmarks(peer(35), cohort);
    const mrr = r.entries.find(e => e.key === "mrr")!;
    expect(mrr.peers).toBe(5);
    expect(mrr.percentile).toBe(60);
  });

  it("says nothing rather than computing a percentile over four peers", () => {
    const cohort = Array.from({ length: MIN_PEERS - 1 }, (_, i) => peer((i + 1) * 10));
    expect(computeBenchmarks(peer(35), cohort).entries).toHaveLength(0);
  });

  it("skips metrics the founder themselves has not disclosed", () => {
    const cohort = Array.from({ length: 6 }, (_, i) => peer((i + 1) * 10));
    expect(computeBenchmarks(peer(null), cohort).entries).toHaveLength(0);
  });
});
