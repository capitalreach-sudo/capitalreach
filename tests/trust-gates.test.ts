import { describe, it, expect } from "vitest";
import { evaluateGate, type GateConfig, type GateSubject } from "../lib/trust-gates";

/**
 * The gates decide who is refused, so they get tested rather than trusted.
 * Two failure modes matter more than the rest: a gate that locks out an
 * existing member (which would empty the platform on the day it shipped) and
 * a gate an expired verification can still hold open (which is how a hijacked
 * account keeps its privileges).
 */

const GATES_UP = new Date("2026-09-07T18:00:00Z");

const cfg = (mode: "off" | "new" | "all"): GateConfig => ({
  mode,
  since: GATES_UP,
  levels: { publish: 3, message: 2, dataroom: 2 },
});

const subject = (o: Partial<GateSubject> = {}): GateSubject => ({
  type: "investor",
  id: "11111111-1111-1111-1111-111111111111",
  trustLevel: 0,
  trustExpiresAt: null,
  createdAt: null,
  ...o,
});

const BEFORE = "2026-01-01T00:00:00Z";
const AFTER = "2026-09-08T00:00:00Z";

describe("evaluateGate", () => {
  it("allows everything while the gates are off", () => {
    expect(evaluateGate("message", subject(), cfg("off")).allowed).toBe(true);
    expect(evaluateGate("publish", subject(), cfg("off")).allowed).toBe(true);
  });

  it("grandfathers accounts that existed before the gates went up", () => {
    const v = evaluateGate("message", subject({ createdAt: BEFORE }), cfg("new"));
    expect(v.allowed).toBe(true);
    expect(v.allowed && v.reason).toBe("grandfathered");
  });

  it("refuses a new account that has not reached the rung", () => {
    const v = evaluateGate("message", subject({ createdAt: AFTER }), cfg("new"));
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.required).toBe(2);
      expect(v.held).toBe(0);
      expect(v.action).toBe("message");
    }
  });

  it("admits a new account once it holds the rung", () => {
    expect(evaluateGate("message", subject({ createdAt: AFTER, trustLevel: 2 }), cfg("new")).allowed).toBe(true);
  });

  it("does NOT let an expired verification hold a gate open", () => {
    const expired = subject({ createdAt: AFTER, trustLevel: 4, trustExpiresAt: "2020-01-01T00:00:00Z" });
    const v = evaluateGate("dataroom", expired, cfg("new"));
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.held).toBe(0);
  });

  it("keeps an unexpired verification valid", () => {
    const live = subject({ createdAt: AFTER, trustLevel: 2, trustExpiresAt: "2099-01-01T00:00:00Z" });
    expect(evaluateGate("dataroom", live, cfg("new")).allowed).toBe(true);
  });

  it("binds everyone once the mode is all, grandfathering included", () => {
    expect(evaluateGate("message", subject({ createdAt: BEFORE }), cfg("all")).allowed).toBe(false);
  });

  it("holds publish to a higher rung than messaging", () => {
    const atTwo = subject({ createdAt: AFTER, trustLevel: 2 });
    expect(evaluateGate("message", atTwo, cfg("all")).allowed).toBe(true);
    expect(evaluateGate("publish", atTwo, cfg("all")).allowed).toBe(false);
    expect(evaluateGate("publish", subject({ createdAt: AFTER, trustLevel: 3 }), cfg("all")).allowed).toBe(true);
  });

  it("treats a level above the requirement as satisfying it", () => {
    expect(evaluateGate("dataroom", subject({ createdAt: AFTER, trustLevel: 4 }), cfg("all")).allowed).toBe(true);
  });

  it("cannot refuse when a gate's level is set to zero", () => {
    const noRung = { ...cfg("all"), levels: { publish: 0 as const, message: 0 as const, dataroom: 0 as const } };
    expect(evaluateGate("publish", subject(), noRung).allowed).toBe(true);
  });

  it("falls back to enforcing when an account has no creation date in new mode", () => {
    // No date means no proof of being here first, so the rung applies. The
    // alternative -- assuming "old" -- would make a missing column a bypass.
    expect(evaluateGate("message", subject({ createdAt: null }), cfg("new")).allowed).toBe(false);
  });
});
