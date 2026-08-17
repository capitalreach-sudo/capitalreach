import { describe, it, expect } from "vitest";
import { matchesSavedSearch } from "@/lib/search-match";

const base = {
  name: "Acme", tagline: "Widgets for everyone", industry: "B2B SaaS", stage: "seed",
  country: "Germany", mrr: 12000, vaultrise_score: 70, funding_target: 500000,
  runway_months: 14, growth_rate: 25, round_close_date: null, business_model: "B2B",
  demo_video_url: "https://x/y",
};

describe("matchesSavedSearch — one matcher for browse and alerts", () => {
  it("empty filters match everything", () => {
    expect(matchesSavedSearch({}, base)).toBe(true);
  });
  it("query matches name or tagline, case-insensitively", () => {
    expect(matchesSavedSearch({ query: "acme" }, base)).toBe(true);
    expect(matchesSavedSearch({ query: "WIDGET" }, base)).toBe(true);
    expect(matchesSavedSearch({ query: "banana" }, base)).toBe(false);
  });
  it("respects every numeric floor the browse page exposes (the fields the old cron dropped)", () => {
    expect(matchesSavedSearch({ raisingMin: 1_000_000 }, base)).toBe(false);
    expect(matchesSavedSearch({ raisingMin: 100_000 }, base)).toBe(true);
    expect(matchesSavedSearch({ runwayMin: 18 }, base)).toBe(false);
    expect(matchesSavedSearch({ growthMin: 20 }, base)).toBe(true);
    expect(matchesSavedSearch({ growthMin: 50 }, base)).toBe(false);
  });
  it("respects business model, demo, and country (canonical compare)", () => {
    expect(matchesSavedSearch({ businessModel: "B2C" }, base)).toBe(false);
    expect(matchesSavedSearch({ hasDemo: true }, { ...base, demo_video_url: null })).toBe(false);
    expect(matchesSavedSearch({ country: "germany" }, base)).toBe(true);
  });
  it("closingSoon requires a live close date", () => {
    expect(matchesSavedSearch({ closingSoon: true }, base)).toBe(false);
    const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    expect(matchesSavedSearch({ closingSoon: true }, { ...base, round_close_date: soon })).toBe(true);
  });
});
