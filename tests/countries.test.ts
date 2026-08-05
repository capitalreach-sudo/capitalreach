import { describe, it, expect } from "vitest";
import { normalizeCountry, sameCountry, COUNTRIES } from "../lib/countries";
import { computeMatchScore } from "../lib/match-score";

describe("normalizeCountry", () => {
  it("collapses the exact case seen in production", () => {
    // The browse Region facet showed "Deutschland (1)" and "germany (1)" as
    // two separate regions for the same country.
    expect(normalizeCountry("germany")).toBe("Germany");
    expect(normalizeCountry("Deutschland")).toBe("Germany");
    expect(sameCountry("germany", "Deutschland")).toBe(true);
  });

  it("handles casing, whitespace, ISO codes and informal names", () => {
    expect(normalizeCountry("  GERMANY  ")).toBe("Germany");
    expect(normalizeCountry("DE")).toBe("Germany");
    expect(normalizeCountry("uk")).toBe("United Kingdom");
    expect(normalizeCountry("England")).toBe("United Kingdom");
    expect(normalizeCountry("usa")).toBe("United States");
    expect(normalizeCountry("Österreich")).toBe("Austria");
  });

  it("passes through anything it does not recognise, rather than dropping it", () => {
    // A founder in an unlisted country must still appear in the facet under
    // their own spelling instead of vanishing from the directory.
    expect(normalizeCountry("Liechtenstein")).toBe("Liechtenstein");
    expect(normalizeCountry("")).toBe("");
    expect(normalizeCountry(null)).toBe("");
    expect(normalizeCountry("   ")).toBe("");
  });

  it("every canonical name is a fixed point", () => {
    for (const c of COUNTRIES) expect(normalizeCountry(c)).toBe(c);
  });

  it("sameCountry is false when either side is empty", () => {
    expect(sameCountry("", "Germany")).toBe(false);
    expect(sameCountry(null, null)).toBe(false);
  });
});

describe("match score geography", () => {
  const startup = {
    stage: "seed", industry: "FinTech", funding_target: 1_000_000,
    vaultrise_score: null, country: "germany", target_markets: null,
  };

  it("awards geography across spelling variants", () => {
    // Before normalisation this scored 0: "Germany" !== "germany".
    expect(computeMatchScore({ geography: ["Germany"] }, startup).geography).toBe(true);
    expect(computeMatchScore({ geography: ["Deutschland"] }, startup).geography).toBe(true);
    expect(computeMatchScore({ geography: ["DE"] }, startup).geography).toBe(true);
  });

  it("still says no when the country genuinely differs", () => {
    expect(computeMatchScore({ geography: ["France"] }, startup).geography).toBe(false);
    expect(computeMatchScore({ geography: [] }, startup).geography).toBe(false);
  });

  it("matches on target markets too", () => {
    const s = { ...startup, country: null, target_markets: ["usa"] };
    expect(computeMatchScore({ geography: ["United States"] }, s).geography).toBe(true);
  });
});
