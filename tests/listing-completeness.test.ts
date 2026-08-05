import { describe, it, expect } from "vitest";
import { listingCompleteness } from "../lib/listing-completeness";

const complete = {
  tagline: "t", problem: "p", solution: "s", market: "m",
  competitive_advantage: "c", use_of_funds: "u", website: "w",
  funding_target: 1_000_000, equity_offered: 10, min_check_size: 25_000,
  booking_url: "b", mrr: 1_000,
  founders: [{ linkedin_url: "https://linkedin.com/in/x" }],
  documents: [{}],
  milestones: [{}],
};

describe("listingCompleteness", () => {
  it("weights sum to exactly 100", () => {
    // Guards the whole model: adding a field without rebalancing would make a
    // finished listing read as 97% forever, and nobody would know why.
    const { items } = listingCompleteness({});
    expect(items.reduce((s, i) => s + i.weight, 0)).toBe(100);
  });

  it("an empty listing scores 0 and is told to add a deck first", () => {
    const { percent, next } = listingCompleteness({});
    expect(percent).toBe(0);
    expect(next?.key).toBe("deck");
  });

  it("a fully filled listing scores 100 with nothing left to do", () => {
    const { percent, next } = listingCompleteness(complete);
    expect(percent).toBe(100);
    expect(next).toBeNull();
  });

  it("counts traction from any one signal, so pre-revenue is not penalised", () => {
    for (const signal of [{ mrr: 500 }, { arr: 6000 }, { paying_customers: 3 }, { user_count: 900 }]) {
      const { items } = listingCompleteness(signal);
      expect(items.find((i) => i.key === "traction")?.done).toBe(true);
    }
    expect(listingCompleteness({}).items.find((i) => i.key === "traction")?.done).toBe(false);
  });

  it("treats whitespace and zero as missing, not filled", () => {
    // "   " in a textarea and a 0% equity offer are both the user not having
    // answered; scoring them as done would overstate the listing.
    const { percent } = listingCompleteness({ problem: "   ", equity_offered: 0, mrr: 0, funding_target: 0 });
    expect(percent).toBe(0);
  });

  it("a founder without a LinkedIn URL scores the founder item but not linkedin", () => {
    const { items } = listingCompleteness({ founders: [{ linkedin_url: null }] });
    expect(items.find((i) => i.key === "founder")?.done).toBe(true);
    expect(items.find((i) => i.key === "linkedin")?.done).toBe(false);
  });

  it("always suggests the heaviest remaining item, not the first declared", () => {
    // Deck done, so the next-heaviest miss wins: problem (10) over market (6).
    const { next } = listingCompleteness({ documents: [{}], market: "m" });
    expect(next?.key).toBe("problem");
  });

  it("is monotonic: filling any single field never lowers the score", () => {
    const base = listingCompleteness({}).percent;
    for (const [k, v] of Object.entries(complete)) {
      const { percent } = listingCompleteness({ [k]: v });
      expect(percent).toBeGreaterThanOrEqual(base);
    }
  });
});

describe("listingCompleteness i18n", () => {
  // The lib emits i18n keys rather than copy, so a typo here renders the raw
  // key on the founder dashboard -- exactly the class of bug that shipped
  // earlier this project as a literal "settings.notifPrefs" on screen.
  const flat = (d: Record<string, unknown>, p = ""): Record<string, string> => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(d)) {
      const kk = p ? `${p}.${k}` : k;
      if (v && typeof v === "object") Object.assign(o, flat(v as Record<string, unknown>, kk));
      else o[kk] = String(v);
    }
    return o;
  };

  it("every label key it can emit exists in en and de", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const en = flat(JSON.parse(readFileSync(join(__dirname, "..", "messages", "en.json"), "utf8")));
    const de = flat(JSON.parse(readFileSync(join(__dirname, "..", "messages", "de.json"), "utf8")));
    const keys = listingCompleteness({}).items.map((i) => i.labelKey);
    expect(keys.filter((k) => !(k in en))).toEqual([]);
    expect(keys.filter((k) => !(k in de))).toEqual([]);
  });
});
