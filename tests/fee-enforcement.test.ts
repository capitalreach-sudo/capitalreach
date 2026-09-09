import { describe, it, expect } from "vitest";
import { dueStep, shouldEscalate, type FeeDealRow, type EnforcementConfig } from "../lib/fee-enforcement";

/**
 * This ladder pauses somebody's fundraise. The tests that matter most are the
 * ones proving it does NOT fire: on a paid fee, a waived one, an open
 * dispute, or a founder who is merely late rather than absent.
 */
const cfg: EnforcementConfig = { enabled: true, pauseDays: 14, restrictDays: 30 };
const off: EnforcementConfig = { enabled: false, pauseDays: 14, restrictDays: 30 };

const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const deal = (o: Partial<FeeDealRow> = {}): FeeDealRow => ({
  id: "d", startup_id: "s", closed_at: ago(40),
  success_fee_amount: 2000, success_fee_invoiced: true,
  success_fee_paid_at: null, fee_waived_at: null,
  fee_disputed_at: null, fee_dispute_resolved_at: null, fee_enforcement: "none",
  ...o,
});

describe("dueStep", () => {
  it("does nothing while enforcement is off", () => {
    expect(dueStep(deal(), off)).toBe("none");
  });

  it("resolves a paid fee", () => {
    expect(dueStep(deal({ success_fee_paid_at: ago(1) }), cfg)).toBe("resolved");
  });

  it("resolves a waived fee", () => {
    expect(dueStep(deal({ fee_waived_at: ago(1) }), cfg)).toBe("resolved");
  });

  it("does nothing when no fee is owed", () => {
    expect(dueStep(deal({ success_fee_amount: 0 }), cfg)).toBe("none");
  });

  it("does nothing before an invoice exists", () => {
    expect(dueStep(deal({ success_fee_invoiced: false }), cfg)).toBe("none");
  });

  it("FREEZES on an open dispute rather than escalating", () => {
    const d = deal({ fee_disputed_at: ago(20), fee_enforcement: "reminded" });
    expect(dueStep(d, cfg)).toBe("reminded");
  });

  it("resumes once a dispute is resolved", () => {
    const d = deal({ fee_disputed_at: ago(20), fee_dispute_resolved_at: ago(2) });
    expect(dueStep(d, cfg)).toBe("account_restricted");
  });

  it("only reminds inside the first two weeks", () => {
    expect(dueStep(deal({ closed_at: ago(3) }), cfg)).toBe("reminded");
    expect(dueStep(deal({ closed_at: ago(13) }), cfg)).toBe("reminded");
  });

  it("pauses the listing at fourteen days", () => {
    expect(dueStep(deal({ closed_at: ago(14) }), cfg)).toBe("listing_paused");
    expect(dueStep(deal({ closed_at: ago(29) }), cfg)).toBe("listing_paused");
  });

  it("restricts the account at thirty", () => {
    expect(dueStep(deal({ closed_at: ago(30) }), cfg)).toBe("account_restricted");
  });
});

describe("shouldEscalate", () => {
  it("moves forward only", () => {
    expect(shouldEscalate("none", "listing_paused")).toBe(true);
    expect(shouldEscalate("listing_paused", "reminded")).toBe(false);
    expect(shouldEscalate("account_restricted", "listing_paused")).toBe(false);
  });

  it("never repeats a step it has already taken", () => {
    expect(shouldEscalate("listing_paused", "listing_paused")).toBe(false);
  });

  it("always lets payment resolve, from any step", () => {
    expect(shouldEscalate("account_restricted", "resolved")).toBe(true);
    expect(shouldEscalate("resolved", "resolved")).toBe(false);
  });
});
