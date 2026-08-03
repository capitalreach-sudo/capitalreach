import { describe, it, expect } from "vitest";
import { founderCan, investorCan, type AccessContext } from "@/lib/access";

const ctx = (over: Partial<AccessContext>): AccessContext => ({
  userId: "u", role: "investor", tier: "free",
  isLaunchMode: false, suspended: false, ...over,
});

describe("suspension short-circuits everything", () => {
  it("a suspended investor can do nothing, even in launch mode", () => {
    const c = investorCan(ctx({ suspended: true, isLaunchMode: true, tier: "pro" }));
    expect(c.browse).toBe(false);
    expect(c.message).toBe(false);
    expect(c.viewFinancials).toBe(false);
  });
  it("a suspended founder cannot list or upload", () => {
    const c = founderCan(ctx({ role: "startup", suspended: true, isLaunchMode: true }));
    expect(c.listStartup).toBe(false);
    expect(c.docLimit).toBe(0);
  });
});

describe("launch mode grants the top tier", () => {
  it("free investor gets pro capabilities during launch", () => {
    const c = investorCan(ctx({ isLaunchMode: true, tier: "free" }));
    expect(c.viewFinancials).toBe(true);
    expect(c.messageLimit).toBe(Infinity);
  });
  it("free founder gets growth during launch, including unlimited docs", () => {
    const c = founderCan(ctx({ role: "startup", isLaunchMode: true, tier: "free" }));
    expect(c.docLimit).toBe(Infinity);
  });
});

describe("outside launch, tiers bind", () => {
  it("free founder has zero document allowance", () => {
    expect(founderCan(ctx({ role: "startup", tier: "free" })).docLimit).toBe(0);
  });
  it("starter founder gets 3 documents, growth unlimited", () => {
    expect(founderCan(ctx({ role: "startup", tier: "starter" })).docLimit).toBe(3);
    expect(founderCan(ctx({ role: "startup", tier: "growth" })).docLimit).toBe(Infinity);
  });
});

describe("admin bypasses tier gates", () => {
  it("an admin gets top-tier capabilities on both sides, outside launch, on the free tier", () => {
    const inv = investorCan(ctx({ role: "admin", tier: "free", isLaunchMode: false }));
    expect(inv.viewFinancials).toBe(true);
    expect(inv.messageLimit).toBe(Infinity);
    const fdr = founderCan(ctx({ role: "admin", tier: "free", isLaunchMode: false }));
    expect(fdr.docLimit).toBe(Infinity);
  });
  it("suspension still beats admin", () => {
    const c = investorCan(ctx({ role: "admin", suspended: true, isLaunchMode: true }));
    expect(c.browse).toBe(false);
  });
});
