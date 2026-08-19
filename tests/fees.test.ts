import { describe, it, expect } from "vitest";
import { feeState, feeMajor, reminderDue, retryable, autoRetryable, ledgerTotals, DUNNING_DAYS } from "@/lib/fees";

const base = { success_fee_amount: 100000, success_fee_invoiced: true, success_fee_paid_at: null, fee_billing_status: "invoiced" as string | null };

describe("fee state", () => {
  it("has no state worth tracking when there is no fee", () => {
    expect(feeState({ ...base, success_fee_amount: null })).toBe("none");
    expect(feeState({ ...base, success_fee_amount: 0 })).toBe("none");
  });

  it("is collected when Stripe paid it or it was recorded offline", () => {
    expect(feeState({ ...base, success_fee_paid_at: "2026-08-01" })).toBe("collected");
    expect(feeState({ ...base, fee_billing_status: "paid_offline" })).toBe("collected");
  });

  it("is unbillable when there was no customer or Stripe refused", () => {
    expect(feeState({ ...base, success_fee_invoiced: false, fee_billing_status: "no_customer" })).toBe("unbillable");
    expect(feeState({ ...base, fee_billing_status: "failed" })).toBe("unbillable");
  });

  it("treats a fee that was never invoiced and never failed as unbillable, not collected", () => {
    // Silence about a fee is not payment of it.
    expect(feeState({ ...base, success_fee_invoiced: false, fee_billing_status: null })).toBe("unbillable");
  });

  it("an open dispute stops the platform asserting the money is simply owed", () => {
    expect(feeState({ ...base, fee_disputed_at: "2026-08-01" })).toBe("disputed");
    // Resolved, and still unpaid: back to outstanding, and chaseable again.
    expect(feeState({ ...base, fee_disputed_at: "2026-08-01", fee_dispute_resolved_at: "2026-08-05" })).toBe("outstanding");
    // Payment settles a dispute without anyone resolving it.
    expect(feeState({ ...base, fee_disputed_at: "2026-08-01", success_fee_paid_at: "2026-08-03" })).toBe("collected");
  });

  it("never chases a disputed fee", () => {
    expect(reminderDue({ ...base, closed_at: "2026-07-01T00:00:00Z", fee_disputed_at: "2026-07-02" }, new Date("2026-09-01"))).toBe(false);
  });

  it("a reversal outranks payment — refunded money is not revenue", () => {
    expect(feeState({ ...base, success_fee_paid_at: "2026-08-01", fee_refunded_at: "2026-08-10" })).toBe("reversed");
    expect(feeState({ ...base, success_fee_paid_at: "2026-08-01", fee_chargeback_at: "2026-08-10" })).toBe("reversed");
  });

  it("a chargeback the platform won is collected again", () => {
    expect(feeState({
      ...base, success_fee_paid_at: "2026-08-01",
      fee_chargeback_at: "2026-08-10", fee_chargeback_resolved_at: "2026-08-20",
    })).toBe("collected");
  });

  it("Stripe giving up on collection is unbillable, not collected", () => {
    expect(feeState({ ...base, fee_billing_status: "uncollectible" })).toBe("unbillable");
    expect(feeState({ ...base, fee_billing_status: "voided" })).toBe("unbillable");
  });

  it("a waive beats every other state", () => {
    expect(feeState({ ...base, fee_waived_at: "2026-08-01" })).toBe("waived");
  });

  it("reads the amount out of minor units", () => {
    expect(feeMajor(base)).toBe(1000);
  });
});

describe("dunning", () => {
  const closed = "2026-07-01T00:00:00Z";
  const at = (days: number) => new Date(Date.parse(closed) + days * 86_400_000);

  it("does not chase before the first threshold", () => {
    expect(reminderDue({ ...base, closed_at: closed, fee_reminder_count: 0 }, at(DUNNING_DAYS[0] - 1))).toBe(false);
    expect(reminderDue({ ...base, closed_at: closed, fee_reminder_count: 0 }, at(DUNNING_DAYS[0]))).toBe(true);
  });

  it("walks the schedule and then stops", () => {
    expect(reminderDue({ ...base, closed_at: closed, fee_reminder_count: 1 }, at(13))).toBe(false);
    expect(reminderDue({ ...base, closed_at: closed, fee_reminder_count: 1 }, at(14))).toBe(true);
    expect(reminderDue({ ...base, closed_at: closed, fee_reminder_count: 3 }, at(120))).toBe(false);
  });

  it("cannot chase twice in one day however often the cron runs", () => {
    const d = { ...base, closed_at: closed, fee_reminder_count: 1, fee_reminder_last_at: at(14).toISOString() };
    expect(reminderDue(d, at(14))).toBe(false);
    expect(reminderDue(d, at(15))).toBe(true);
  });

  it("never chases a fee that is paid, waived or was never invoiced", () => {
    expect(reminderDue({ ...base, closed_at: closed, success_fee_paid_at: "2026-07-05" }, at(60))).toBe(false);
    expect(reminderDue({ ...base, closed_at: closed, fee_waived_at: "2026-07-05" }, at(60))).toBe(false);
    expect(reminderDue({ ...base, closed_at: closed, fee_billing_status: "no_customer", success_fee_invoiced: false }, at(60))).toBe(false);
  });
});

describe("automatic retry is narrower than manual", () => {
  it("rescues a fee that was never invoiced", () => {
    expect(autoRetryable({ ...base, success_fee_invoiced: false, fee_billing_status: "no_customer" }, true)).toBe(true);
    expect(autoRetryable({ ...base, fee_billing_status: "failed" }, true)).toBe(true);
  });

  it("never re-invoices one Stripe already gave up collecting", () => {
    // retryable() allows it — an operator may decide to. The cron must not,
    // or it mints a duplicate invoice at the founder every night.
    const d = { ...base, fee_billing_status: "uncollectible" };
    expect(retryable(d, true)).toBe(true);
    expect(autoRetryable(d, true)).toBe(false);
  });
});

describe("retry", () => {
  it("becomes billable once the founder has a Stripe customer", () => {
    const d = { ...base, success_fee_invoiced: false, fee_billing_status: "no_customer" };
    expect(retryable(d, false)).toBe(false);
    expect(retryable(d, true)).toBe(true);
  });

  it("never retries something already invoiced or waived", () => {
    expect(retryable(base, true)).toBe(false);
    expect(retryable({ ...base, fee_waived_at: "2026-08-01" }, true)).toBe(false);
  });
});

describe("ledger totals", () => {
  it("keeps the four buckets apart", () => {
    const totals = ledgerTotals([
      { ...base, success_fee_paid_at: "2026-08-01" },
      { ...base },
      { ...base, success_fee_invoiced: false, fee_billing_status: "no_customer" },
      { ...base, fee_waived_at: "2026-08-02" },
      { ...base, success_fee_amount: null },
    ]);
    expect(totals).toEqual({ collected: 1000, outstanding: 1000, unbillable: 1000, waived: 1000, disputed: 0, reversed: 0 });
  });
});
