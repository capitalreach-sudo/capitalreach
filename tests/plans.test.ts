import { describe, it, expect } from "vitest";
import {
  FOUNDER_PLANS_LIST, INVESTOR_PLANS_LIST, annualPricing, priceEnvKey,
} from "@/lib/plans";

const paid = [...FOUNDER_PLANS_LIST, ...INVESTOR_PLANS_LIST].filter(p => p.price > 0);

describe("annual billing", () => {
  it("prices every paid plan for the year", () => {
    expect(paid.length).toBeGreaterThan(0);
    for (const p of paid) expect(p.annualPrice).toBeGreaterThan(0);
  });

  it("discounts by 20–30% — the band that makes a year worth committing to", () => {
    for (const p of paid) {
      const a = annualPricing(p)!;
      expect(a.percentOff).toBeGreaterThanOrEqual(20);
      expect(a.percentOff).toBeLessThanOrEqual(30);
    }
  });

  it("never charges more for a year than twelve months would", () => {
    for (const p of paid) expect(p.annualPrice!).toBeLessThan(p.price * 12);
  });

  it("has no annual price to show for free or custom plans", () => {
    const free = FOUNDER_PLANS_LIST.find(p => p.price === 0)!;
    expect(annualPricing(free)).toBeNull();
  });

  it("resolves a distinct Stripe price per interval", () => {
    for (const p of paid) {
      const m = priceEnvKey(p, "month");
      const y = priceEnvKey(p, "year");
      expect(m).toBeTruthy();
      expect(y).toBeTruthy();
      // Billing a yearly signup against the monthly price id is the bug this
      // whole seam exists to prevent.
      expect(m).not.toBe(y);
    }
  });
});

describe("plan differentiation", () => {
  it("gives every paid tier something the tier below it does not have", () => {
    const check = (list: ReadonlyArray<{ name: string; features: object }>) => {
      for (let i = 1; i < list.length; i++) {
        const below = list[i - 1].features as Record<string, unknown>;
        const here = list[i].features as Record<string, unknown>;
        const better = Object.keys(here).some(k => {
          const a = below[k], b = here[k];
          if (typeof a === "boolean") return b === true && a === false;
          if (typeof a === "number" && typeof b === "number") return b > a;
          // null means unlimited on messageLimit — better than any number.
          return a !== null && b === null;
        });
        expect(better, `${list[i].name} adds nothing over ${list[i - 1].name}`).toBe(true);
      }
    };
    check(FOUNDER_PLANS_LIST);
    check(INVESTOR_PLANS_LIST);
  });

  it("never takes a feature away as the price goes up", () => {
    const check = (list: ReadonlyArray<{ name: string; features: object }>) => {
      for (let i = 1; i < list.length; i++) {
        for (const [k, below] of Object.entries(list[i - 1].features)) {
          const here = (list[i].features as Record<string, unknown>)[k];
          if (typeof below === "boolean" && below === true) {
            expect(here, `${list[i].name} lost ${k}`).toBe(true);
          }
          if (typeof below === "number" && typeof here === "number") {
            expect(here, `${list[i].name} reduced ${k}`).toBeGreaterThanOrEqual(below);
          }
        }
      }
    };
    check(FOUNDER_PLANS_LIST);
    check(INVESTOR_PLANS_LIST);
  });
});
