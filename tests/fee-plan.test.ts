import { describe, it, expect } from "vitest";
import { planInstalments, planProgress, planAllowed, MAX_PLAN_MONTHS } from "@/lib/fee-plan";

describe("instalment schedules", () => {
  it("adds up to the fee exactly", () => {
    // The property that matters: the platform is owed the same money either
    // way. A schedule that loses a cent to rounding is a schedule that never
    // settles the invoice it is paying.
    for (const total of [100_000, 100_001, 100_002, 333_333, 1, 999_999_999]) {
      for (let m = 2; m <= MAX_PLAN_MONTHS; m++) {
        const sum = planInstalments(total, m, "2026-08-20").reduce((s, i) => s + i.amount, 0);
        expect(sum, `${total} over ${m}`).toBe(total);
      }
    }
  });

  it("never schedules a zero payment", () => {
    // 5 minor units over 6 months would be four empty invoices without the
    // remainder going somewhere deliberate.
    const rows = planInstalments(5, 6, "2026-08-20");
    expect(rows.every(r => r.amount > 0)).toBe(true);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(5);
  });

  it("puts the rounding remainder in the first payment, so later ones are round", () => {
    const rows = planInstalments(100_001, 3, "2026-01-15");
    expect(rows.map(r => r.amount)).toEqual([33_335, 33_333, 33_333]);
  });

  it("advances one month at a time and never lands on a date that does not exist", () => {
    const rows = planInstalments(90_000, 3, "2026-01-31");
    // Clamped to the 28th rather than skidding into March.
    expect(rows.map(r => r.dueDate)).toEqual(["2026-01-28", "2026-02-28", "2026-03-28"]);
  });

  it("clamps the term to the allowed range", () => {
    expect(planInstalments(60_000, 99, "2026-08-20")).toHaveLength(MAX_PLAN_MONTHS);
    expect(planInstalments(60_000, 1, "2026-08-20")).toHaveLength(2);
  });

  it("declines a fee too small to be worth spreading", () => {
    expect(planAllowed(49_999)).toBe(false);
    expect(planAllowed(50_000)).toBe(true);
    expect(planAllowed(null)).toBe(false);
  });
});

describe("plan progress", () => {
  const rows = [
    { seq: 1, amount: 30_000, due_date: "2026-06-01", paid_at: "2026-06-02T00:00:00Z" },
    { seq: 2, amount: 30_000, due_date: "2026-07-01", paid_at: null },
    { seq: 3, amount: 30_000, due_date: "2026-09-01", paid_at: null },
  ];

  it("separates paid from outstanding", () => {
    const p = planProgress(rows, new Date("2026-08-20"));
    expect(p.paid).toBe(30_000);
    expect(p.outstanding).toBe(60_000);
    expect(p.paidCount).toBe(1);
  });

  it("counts an instalment overdue only once its date has passed", () => {
    const p = planProgress(rows, new Date("2026-08-20"));
    expect(p.overdue.map(r => r.seq)).toEqual([2]);
  });

  it("is complete only when every instalment is paid", () => {
    expect(planProgress(rows, new Date("2026-08-20")).complete).toBe(false);
    expect(planProgress(rows.map(r => ({ ...r, paid_at: "2026-08-01T00:00:00Z" }))).complete).toBe(true);
  });

  it("treats no schedule as incomplete rather than as fully paid", () => {
    expect(planProgress([]).complete).toBe(false);
  });
});
