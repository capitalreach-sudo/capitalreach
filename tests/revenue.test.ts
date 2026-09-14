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

  it("separates billed, collected, outstanding and unbillable fees, per currency", () => {
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
    const eur = r.feesByCurrency.find(c => c.currency === "EUR");
    const usd = r.feesByCurrency.find(c => c.currency === "USD");
    expect(eur).toMatchObject({ collected: 1500, outstanding: 1000, billed: 2500, unbillable: 0 });
    expect(usd).toMatchObject({ collected: 0, outstanding: 0, billed: 0, unbillable: 2000 });
    expect(r.feeCurrencies.sort()).toEqual(["EUR", "USD"]);
  });

  it("never blends two currencies' amounts into one number, even within the same bucket", () => {
    const r = summariseRevenue([], [
      { success_fee_amount: 150000, success_fee_invoiced: true, success_fee_paid_at: "2026-08-01", fee_billing_status: "invoiced", currency: "EUR" },
      { success_fee_amount: 100000, success_fee_invoiced: true, success_fee_paid_at: "2026-08-01", fee_billing_status: "invoiced", currency: "USD" },
    ]);
    // Both collected, in different currencies -- 1500 EUR and 1000 USD must
    // stay two rows. A blended reading would wrongly show 2500 of one unit.
    expect(r.feesByCurrency).toHaveLength(2);
    expect(r.feesByCurrency.find(c => c.currency === "EUR")).toMatchObject({ collected: 1500 });
    expect(r.feesByCurrency.find(c => c.currency === "USD")).toMatchObject({ collected: 1000 });
  });

  it("falls back to USD for a deal with no currency stored", () => {
    const r = summariseRevenue([], [
      { success_fee_amount: 50000, success_fee_invoiced: true, success_fee_paid_at: "2026-08-01", fee_billing_status: "invoiced", currency: null },
    ]);
    expect(r.feesByCurrency).toEqual([expect.objectContaining({ currency: "USD", collected: 500 })]);
  });
});

describe("revenue never counts money that came back out", () => {
  it("puts a refunded fee in its own bucket, not in collected", () => {
    const r = summariseRevenue([], [
      { success_fee_amount: 100000, success_fee_invoiced: true, success_fee_paid_at: "2026-08-01", fee_billing_status: "invoiced", currency: "EUR" },
      { success_fee_amount: 100000, success_fee_invoiced: true, success_fee_paid_at: "2026-08-01", fee_billing_status: "refunded", fee_refunded_at: "2026-08-09", currency: "EUR" },
    ]);
    const eur = r.feesByCurrency.find(c => c.currency === "EUR");
    expect(eur?.collected).toBe(1000);
    expect(eur?.reversed).toBe(1000);
    // Both were genuinely billed; only one is money the platform still has.
    expect(eur?.billed).toBe(2000);
  });

  it("counts a disputed fee as outstanding, not as lost", () => {
    const r = summariseRevenue([], [
      { success_fee_amount: 50000, success_fee_invoiced: true, success_fee_paid_at: null, fee_billing_status: "invoiced", fee_disputed_at: "2026-08-05", currency: "EUR" },
    ]);
    const eur = r.feesByCurrency.find(c => c.currency === "EUR");
    expect(eur?.outstanding).toBe(500);
    expect(eur?.unbillable ?? 0).toBe(0);
  });
});
