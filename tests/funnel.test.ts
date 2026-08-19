import { describe, it, expect } from "vitest";
import { summariseFunnel } from "@/lib/funnel";

const founders = [{ id: "f1" }, { id: "f2" }, { id: "f3" }, { id: "f4" }];

describe("funnel", () => {
  it("counts distinct listings, not deals", () => {
    // One busy listing with three investors must not widen the funnel.
    const steps = summariseFunnel({
      founders,
      listings: [{ owner_id: "f1", status: "active", listed_at: "2026-01-01" }],
      deals: [
        { startup_id: "s1", status: "intro", closed_at: null, funded_at: null },
        { startup_id: "s1", status: "intro", closed_at: null, funded_at: null },
        { startup_id: "s1", status: "intro", closed_at: null, funded_at: null },
      ],
    });
    expect(steps.find(s => s.key === "gotInterest")!.count).toBe(1);
  });

  it("never reports a step as a share of one it does not descend from", () => {
    const steps = summariseFunnel({
      founders,
      listings: [
        { owner_id: "f1", status: "active", listed_at: "2026-01-01" },
        { owner_id: "f2", status: "draft", listed_at: null },
      ],
      deals: [],
    });
    const live = steps.find(s => s.key === "wentLive")!;
    const created = steps.find(s => s.key === "createdListing")!;
    expect(created.count).toBe(2);
    expect(live.count).toBe(1);
    expect(live.fromPrev).toBe(50);
    expect(live.fromTop).toBe(25);
  });

  it("gives the first step no percentages to be a share of", () => {
    const steps = summariseFunnel({ founders, listings: [], deals: [] });
    expect(steps[0].fromPrev).toBeNull();
    expect(steps[0].fromTop).toBeNull();
  });

  it("does not divide by zero on an empty platform", () => {
    const steps = summariseFunnel({ founders: [], listings: [], deals: [] });
    expect(steps.every(s => s.count === 0)).toBe(true);
    expect(steps[1].fromPrev).toBeNull();
  });

  it("counts a funded deal at every stage it passed through", () => {
    const steps = summariseFunnel({
      founders: [{ id: "f1" }],
      listings: [{ owner_id: "f1", status: "active", listed_at: "2026-01-01" }],
      deals: [{ startup_id: "s1", status: "closed", closed_at: "2026-02-01", funded_at: "2026-02-05" }],
    });
    const at = (k: string) => steps.find(s => s.key === k)!.count;
    expect(at("gotInterest")).toBe(1);
    expect(at("reachedDiligence")).toBe(1);
    expect(at("reachedTermSheet")).toBe(1);
    expect(at("closed")).toBe(1);
    expect(at("funded")).toBe(1);
  });
});
