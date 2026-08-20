import { describe, it, expect } from "vitest";
import { buildAccessContext, founderCan, investorCan } from "@/lib/access";

/**
 * AI is a paid feature — with two exemptions that have to keep working.
 *
 * These test the tier logic checkAiAccess relies on, without a database.
 */
const ctx = (role: "startup" | "investor" | "admin", tier: string | null, isLaunch = false) =>
  buildAccessContext({ id: "u", role, subscription_tier: tier }, isLaunch);

describe("AI is a paid feature", () => {
  it("is off for a founder on the free plan", () => {
    expect(founderCan(ctx("startup", "free")).aiPitchScore).toBe(false);
  });

  it("is off for an investor on the free plan", () => {
    expect(investorCan(ctx("investor", "free")).aiScore).toBe(false);
  });

  it("is on once they pay", () => {
    expect(founderCan(ctx("startup", "starter")).aiPitchScore).toBe(true);
    expect(investorCan(ctx("investor", "angel")).aiScore).toBe(true);
  });
});

describe("the exemptions", () => {
  it("gives admins AI on any tier, because a billing rule aimed at customers should not block an operator", () => {
    expect(founderCan(ctx("admin", "free")).aiPitchScore).toBe(true);
    expect(investorCan(ctx("admin", null)).aiScore).toBe(true);
  });

  it("gives everyone AI while launch mode is on, and takes it back when it ends", () => {
    expect(founderCan(ctx("startup", "free", true)).aiPitchScore).toBe(true);
    expect(investorCan(ctx("investor", "free", true)).aiScore).toBe(true);
    // The same accounts, the day launch mode ends.
    expect(founderCan(ctx("startup", "free", false)).aiPitchScore).toBe(false);
    expect(investorCan(ctx("investor", "free", false)).aiScore).toBe(false);
  });

  it("does not exempt a suspended admin", () => {
    const suspended = buildAccessContext(
      { id: "u", role: "admin", subscription_tier: "free", suspended: true }, false,
    );
    expect(founderCan(suspended).aiPitchScore).toBe(false);
  });
});
