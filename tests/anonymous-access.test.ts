import { describe, it, expect } from "vitest";
import { investorCan, founderCan, buildAccessContext } from "../lib/access";

/**
 * The leak this file exists to prevent.
 *
 * Launch mode hands every member the top tier. buildAccessContext(null, true)
 * -- the context for a visitor with no account -- still carried isLaunchMode,
 * so investorTier() returned "pro" for the PUBLIC and the listing page's
 * financial strip never fired. Anonymous readers were served mrr, arr and
 * valuation for every listing on the platform.
 *
 * A promotion is for members. No account, no promotion.
 */
describe("anonymous visitors during launch mode", () => {
  const anon = buildAccessContext(null, true);

  it("has no user and no role", () => {
    expect(anon.userId).toBeNull();
    expect(anon.role).toBeNull();
    expect(anon.isLaunchMode).toBe(true);
  });

  it("cannot see financials", () => {
    expect(investorCan(anon).viewFinancials).toBe(false);
  });

  it("cannot see documents, the team, or co-investors", () => {
    const c = investorCan(anon);
    expect(c.viewDocuments).toBe(false);
    expect(c.viewTeam).toBe(false);
    expect(c.coInvestorVisibility).toBe(false);
  });

  it("cannot message or request an NDA", () => {
    const c = investorCan(anon);
    expect(c.message).toBe(false);
    expect(c.ndaRequest).toBe(false);
  });

  it("gets no founder capabilities either", () => {
    const f = founderCan(anon);
    expect(f.seeInvestorIdentity).toBe(false);
    expect(f.dataRoom).toBe(false);
  });
});

describe("launch mode still promotes real members", () => {
  const member = buildAccessContext(
    { id: "11111111-1111-1111-1111-111111111111", role: "investor", subscription_tier: "free" },
    true,
  );

  it("lifts the paywall for a signed-in free investor", () => {
    const c = investorCan(member);
    expect(c.viewFinancials).toBe(true);
    expect(c.message).toBe(true);
  });

  it("lifts it for a signed-in free founder", () => {
    const founder = buildAccessContext(
      { id: "22222222-2222-2222-2222-222222222222", role: "startup", subscription_tier: "free" },
      true,
    );
    expect(founderCan(founder).seeInvestorIdentity).toBe(true);
  });

  it("stops lifting it once launch mode ends", () => {
    const after = buildAccessContext(
      { id: "11111111-1111-1111-1111-111111111111", role: "investor", subscription_tier: "free" },
      false,
    );
    expect(investorCan(after).viewFinancials).toBe(false);
  });
});
