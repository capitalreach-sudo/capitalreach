import { describe, it, expect } from "vitest";
import {
  FOUNDER_PLANS, INVESTOR_PLANS, FOUNDER_PLANS_LIST, INVESTOR_PLANS_LIST,
  getFounderPlan, getInvestorPlan,
} from "@/lib/plans";

describe("plan tables", () => {
  it("prices match what /pricing and onboarding advertise", () => {
    expect(FOUNDER_PLANS.starter.price).toBe(29);
    expect(FOUNDER_PLANS.growth.price).toBe(79);
    expect(INVESTOR_PLANS.angel.price).toBe(99);
    expect(INVESTOR_PLANS.pro.price).toBe(249);
  });

  it("every paid self-serve plan names a Stripe env var; free and institution do not", () => {
    for (const p of [...FOUNDER_PLANS_LIST, ...INVESTOR_PLANS_LIST]) {
      if (p.price > 0) expect(p.envKey, p.id).toMatch(/^STRIPE_PRICE_/);
      else expect(p.envKey, p.id).toBeNull();
    }
  });

  it("institution is contact-sales: no envKey, price 0", () => {
    expect(INVESTOR_PLANS.institution.envKey).toBeNull();
    expect(INVESTOR_PLANS.institution.price).toBe(0);
  });
});

describe("tier normalisation", () => {
  it("accepts both slug spellings the app has written to the DB", () => {
    expect(getInvestorPlan("pro").id).toBe("pro");
    expect(getInvestorPlan("pro_investor").id).toBe("pro");
    expect(getInvestorPlan("institution").id).toBe("institution");
    expect(getInvestorPlan("institutional").id).toBe("institution");
  });

  it("unknown or missing tiers land on free, never throw", () => {
    expect(getInvestorPlan("DROP TABLE").id).toBe("free");
    expect(getInvestorPlan(null).id).toBe("free");
    expect(getInvestorPlan(undefined).id).toBe("free");
    expect(getFounderPlan("nonsense").id).toBe("free");
    expect(getFounderPlan(null).id).toBe("free");
  });
});
