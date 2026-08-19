import { describe, it, expect } from "vitest";
import { summariseRevenue, tierPrice } from "@/lib/revenue";

describe("revenue (E45)", () => {
  it("prices each side's paid tiers and ignores free/unknown", () => {
    expect(tierPrice("starter")).toBe(29);
    expect(tierPrice("growth")).toBe(79);
    expect(tierPrice("angel")).toBe(99);
    expect(tierPrice("pro_investor")).toBe(249);
    expect(tierPrice("free")).toBe(0);
    expect(tierPrice(null)).toBe(0);
    expect(tierPrice("nonsense")).toBe(0);
  });

  it("counts subscription MRR over every account, not a page of them", () => {
    const tiers = [
      ...Array(60).fill({ subscription_tier: "starter" }),   // past the old 50-row cap
      ...Array(3).fill({ subscription_tier: "angel" }),
      ...Array(40).fill({ subscription_tier: "free" }),
    ];
    const r = summariseRevenue(tiers, []);
    expect(r.subscriptionMrr).toBe(60 * 29 + 3 * 99);
    expect(r.payingAccounts).toBe(63);
    expect(r.byTier[0]).toMatchObject({ tier: "starter", count: 60 });
  });

  it("separates billed, collected, outstanding and unbillable fees", () => {
    const r = summariseRevenue([], [
      // paid
      { success_fee_amount: 150000, success_fee_invoiced: true, success_fee_paid_at: "2026-08-01", fee_billing_status: "invoiced", currency: "EUR" },
      // invoiced, not yet paid
      { success_fee_amount: 100000, success_fee_invoiced: true, success_fee_paid_at: null, fee_billing_status: "invoiced", currency: "EUR" },
      // fee was due but the founder had no payment method — earned, uncollectable
      { success_fee_amount: 200000, success_fee_invoiced: false, success_fee_paid_at: null, fee_billing_status: "no_customer", currency: "USD" },
      // no fee on the deal at all
      { success_fee_amount: null, success_fee_invoiced: false, success_fee_paid_at: null, fee_billing_status: null, currency: "EUR" },
    ]);
    expect(r.feesCollected).toBe(1500);
    expect(r.feesOutstanding).toBe(1000);
    expect(r.feesBilled).toBe(2500);
    expect(r.feesUnbillable).toBe(2000);
    expect(r.feeCurrencies.sort()).toEqual(["EUR", "USD"]);
  });
});
