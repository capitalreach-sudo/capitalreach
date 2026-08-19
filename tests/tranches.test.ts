import { describe, it, expect } from "vitest";
import { scheduleTotal, scheduleReconciles, receivedTotal, allReceived } from "@/lib/tranches";

describe("tranche schedules", () => {
  it("reconciles a clean split", () => {
    expect(scheduleReconciles([50000, 50000], 100000)).toBe(true);
  });

  it("accepts a three-way split of an odd amount", () => {
    // 100000/3 rounded to cents three times still has to be accepted.
    expect(scheduleReconciles([33333.34, 33333.33, 33333.33], 100000)).toBe(true);
  });

  it("rejects a schedule that does not add up", () => {
    expect(scheduleReconciles([50000, 40000], 100000)).toBe(false);
  });

  it("treats an empty schedule and a deal with no amount as nothing to check", () => {
    expect(scheduleReconciles([], 100000)).toBe(true);
    expect(scheduleReconciles([1, 2], null)).toBe(true);
  });

  it("ignores non-numeric entries when totalling", () => {
    expect(scheduleTotal([100, "200", null, undefined, "abc"])).toBe(300);
  });

  it("counts only tranches that were actually received", () => {
    const rows = [
      { amount: 50000, funds_received_at: "2026-01-01T00:00:00Z" },
      { amount: 50000, funds_received_at: null },
    ];
    expect(receivedTotal(rows)).toBe(50000);
    expect(allReceived(rows)).toBe(false);
  });

  it("is not fully funded with no tranches at all", () => {
    expect(allReceived([])).toBe(false);
  });
});
