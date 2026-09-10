import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The gate is one rule asked of a PAIR, so the assertions come in twos: every
 * verdict is checked from the founder's end and the investor's end, and the
 * test is that they agree. A single-sided assertion here would pass against
 * exactly the bug this file exists to prevent.
 *
 * The Supabase client is replaced by an in-memory table set rather than
 * stubbing the policy's own helpers, so sealState runs for real against
 * deal_seals and the grandfathered-deal branch is exercised rather than
 * described.
 */

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

const h = vi.hoisted(() => {
  const state: { db: Db; clientFails: boolean } = { db: {}, clientFails: false };

  function client() {
    return {
      from(table: string) {
        let rows = (state.db[table] ?? []).slice();
        const b = {
          select: () => b,
          eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return b; },
          in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return b; },
          match: (m: Record<string, unknown>) => {
            rows = rows.filter((r) => Object.entries(m).every(([k, v]) => r[k] === v));
            return b;
          },
          lt: (col: string, val: string) => { rows = rows.filter((r) => String(r[col] ?? "") < val); return b; },
          order: (col: string, opts?: { ascending?: boolean }) => {
            const dir = opts?.ascending === false ? -1 : 1;
            rows = rows.slice().sort((x, y) => {
              const a = String(x[col] ?? ""), c = String(y[col] ?? "");
              return a === c ? 0 : (a < c ? -1 : 1) * dir;
            });
            return b;
          },
          limit: (n: number) => { rows = rows.slice(0, n); return b; },
          maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
          // Awaiting the builder itself is how the unfiltered list reads are
          // written in the policy (platform_config, deal_seals).
          then: (resolve: (v: { data: Row[]; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve({ data: rows, error: null }).then(resolve, reject),
        };
        return b;
      },
    };
  }

  return { state, client };
});

vi.mock("@/lib/supabase-server", () => ({
  createAdminClient: () => {
    if (h.state.clientFails) throw new Error("service key missing");
    return h.client();
  },
  createServerSupabaseClient: async () => h.client(),
}));

// Imported statically: vi.mock is hoisted above the imports, so the policy
// module already sees the fake client when it is first evaluated.
import {
  mayPairContact, mayInvestorContact, contactRefusal, contactsUnlocked, SYMMETRIC_GATE_FROM,
} from "@/lib/contact-policy";

const S = "11111111-1111-4111-8111-111111111111";
const I = "22222222-2222-4222-8222-222222222222";
const DEAL = "33333333-3333-4333-8333-333333333333";

const BOTH_ON = [
  { key: "offer_before_contact", value: "on" },
  { key: "seal_before_contact", value: "on" },
];

function seed(db: Db) {
  h.state.db = { platform_config: BOTH_ON, investors: [{ id: I, slug: "northgate" }], ...db };
}

const asFounder = () => mayPairContact({ startupId: S, investorId: I, side: "startup" });
const asInvestor = () => mayInvestorContact({ startupId: S, investorId: I });
const bothEnds = async () => [await asFounder(), await asInvestor()] as const;

const unsealedDeal = [{ id: DEAL, startup_id: S, investor_id: I, sealed_at: null, seal_version: null }];
const signature = (party: "startup" | "investor") => ({
  deal_id: DEAL, party, signed_name: party === "startup" ? "A Founder" : "An Investor",
  signed_at: "2026-09-10T12:00:00.000Z",
});

beforeEach(() => {
  h.state.db = {};
  h.state.clientFails = false;
});

describe("the switch", () => {
  it("lets both ends through when neither half of the rule is on", async () => {
    seed({ platform_config: [{ key: "offer_before_contact", value: "off" }, { key: "seal_before_contact", value: "off" }] });
    for (const v of await bothEnds()) {
      expect(v.allowed).toBe(true);
      expect(v.allowed && v.reason).toBe("policy_off");
    }
  });

  it("treats a missing config row as off, not as on", async () => {
    seed({ platform_config: [] });
    for (const v of await bothEnds()) expect(v.allowed).toBe(true);
  });

  it("fails OPEN when the config cannot be read at all", async () => {
    // Silently closing every conversation on the platform because one row was
    // unreadable is the worse of the two failures.
    seed({});
    h.state.clientFails = true;
    for (const v of await bothEnds()) {
      expect(v.allowed).toBe(true);
      expect(v.allowed && v.reason).toBe("policy_off");
    }
  });
});

describe("nothing on the record", () => {
  it("refuses BOTH ends, which is the whole point of the lane", async () => {
    seed({});
    const [founder, investor] = await bothEnds();
    expect(founder.allowed).toBe(false);
    expect(investor.allowed).toBe(false);
  });

  it("gives each end its own way in, since only one of them may make an offer", async () => {
    seed({});
    const [founder, investor] = await bothEnds();
    expect(!founder.allowed && founder.reason).toBe("needs_deal");
    expect(!investor.allowed && investor.reason).toBe("needs_accepted_offer");
  });

  it("names the newest open proposal and whose move it is", async () => {
    seed({
      deal_proposals: [
        { id: "p-old", startup_id: S, investor_id: I, status: "countered", from_side: "startup", created_at: "2026-09-01T00:00:00.000Z" },
        { id: "p-new", startup_id: S, investor_id: I, status: "pending", from_side: "investor", created_at: "2026-09-05T00:00:00.000Z" },
      ],
    });
    const founder = await asFounder();
    expect(!founder.allowed && founder.reason === "needs_deal" && founder.openProposalId).toBe("p-new");
    expect(!founder.allowed && founder.reason === "needs_deal" && founder.openFromSide).toBe("investor");
  });
});

describe("a deal that is not sealed", () => {
  it("refuses both ends and names the deal they have to sign", async () => {
    seed({ deals: unsealedDeal, deal_seals: [] });
    for (const v of await bothEnds()) {
      expect(v.allowed).toBe(false);
      expect(!v.allowed && v.reason).toBe("needs_seal");
      expect(!v.allowed && v.reason === "needs_seal" && v.dealId).toBe(DEAL);
    }
  });

  it("still refuses the party who has already signed, and says who is missing", async () => {
    seed({ deals: unsealedDeal, deal_seals: [signature("investor")] });
    for (const v of await bothEnds()) {
      expect(!v.allowed && v.reason === "needs_seal" && v.awaiting).toEqual(["startup"]);
    }
  });

  it("opens on the deal alone when the seal half of the rule is off", async () => {
    seed({
      platform_config: [{ key: "offer_before_contact", value: "on" }, { key: "seal_before_contact", value: "off" }],
      deals: unsealedDeal, deal_seals: [],
    });
    for (const v of await bothEnds()) expect(v.allowed && v.reason).toBe("deal_exists");
  });
});

describe("a sealed deal", () => {
  it("lets both ends through once both signatures are in", async () => {
    seed({ deals: unsealedDeal, deal_seals: [signature("startup"), signature("investor")] });
    for (const v of await bothEnds()) {
      expect(v.allowed).toBe(true);
      expect(v.allowed && v.reason).toBe("deal_sealed");
    }
  });

  it("honours a deal grandfathered by the seal migration, with no signatures at all", async () => {
    seed({
      deals: [{ id: DEAL, startup_id: S, investor_id: I, sealed_at: "2026-08-01T00:00:00.000Z", seal_version: "grandfathered" }],
      deal_seals: [],
    });
    for (const v of await bothEnds()) expect(v.allowed).toBe(true);
  });

  it("does not confuse another pair's deal for this one", async () => {
    seed({ deals: [{ id: DEAL, startup_id: S, investor_id: "someone-else", sealed_at: null, seal_version: null }] });
    for (const v of await bothEnds()) expect(v.allowed).toBe(false);
  });
});

describe("an accepted offer whose deal row never landed", () => {
  it("lets the pair talk rather than stranding them on a deal that does not exist", async () => {
    seed({ deal_proposals: [{ id: "p1", startup_id: S, investor_id: I, status: "accepted", from_side: "investor", created_at: "2026-09-02T00:00:00.000Z" }] });
    for (const v of await bothEnds()) {
      expect(v.allowed).toBe(true);
      expect(v.allowed && v.reason).toBe("offer_accepted");
    }
  });
});

describe("grandfathering the founder half", () => {
  const olderThread = [{ id: "t1", startup_id: S, investor_id: I, created_at: "2026-08-20T00:00:00.000Z" }];

  it("keeps a conversation that was legitimate the day before the rule changed", async () => {
    seed({ threads: olderThread });
    const founder = await asFounder();
    expect(founder.allowed).toBe(true);
    expect(founder.allowed && founder.reason).toBe("predates_gate");
  });

  it("does not reopen what the seal deliberately closed on the investor side", async () => {
    seed({ threads: olderThread });
    const investor = await asInvestor();
    expect(investor.allowed).toBe(false);
  });

  it("is not a bypass anyone can mint, since any client may insert a thread row", async () => {
    seed({ threads: [{ id: "t2", startup_id: S, investor_id: I, created_at: SYMMETRIC_GATE_FROM }] });
    const founder = await asFounder();
    expect(founder.allowed).toBe(false);
  });

  it("runs from a fixed past instant, so the boundary cannot drift forward", () => {
    expect(new Date(SYMMETRIC_GATE_FROM).getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("contactRefusal", () => {
  async function founderRefusal(db: Db) {
    seed(db);
    const v = await asFounder();
    if (v.allowed) throw new Error("expected a refusal");
    return contactRefusal(v);
  }

  it("never hands a founder a bare error code to read", async () => {
    // The failure this codebase produces is a refusal with no way forward, and
    // several callers render json.error straight into a toast.
    const r = await founderRefusal({});
    expect(r.error).toMatch(/\s/);
    expect(r.error).not.toMatch(/^[a-z_]+$/);
    expect((r as { errorCode?: string }).errorCode).toBe("deal_required");
  });

  it("sends a founder with nothing on the record to the investor's profile", async () => {
    const r = await founderRefusal({});
    expect((r as { href?: string }).href).toBe("/investors/northgate");
    expect((r as { ctaKey?: string }).ctaKey).toBe("founderContact.openDealCta");
  });

  it("falls back to /deals when the investor has no slug to link to", async () => {
    seed({ investors: [{ id: I, slug: null }] });
    const v = await asFounder();
    expect((contactRefusal(v as Extract<typeof v, { allowed: false }>) as { href?: string }).href).toBe("/deals");
  });

  it("sends a founder to the offer already waiting for them, not to a second deal", async () => {
    const r = await founderRefusal({
      deal_proposals: [{ id: "p1", startup_id: S, investor_id: I, status: "pending", from_side: "investor", created_at: "2026-09-03T00:00:00.000Z" }],
    });
    expect((r as { href?: string }).href).toBe("/dashboard/startup/offers");
    expect((r as { messageKey?: string }).messageKey).toBe("founderContact.offerWaiting");
  });

  it("tells a founder whose own proposal is out that the ball is not in their court", async () => {
    const r = await founderRefusal({
      deal_proposals: [{ id: "p1", startup_id: S, investor_id: I, status: "pending", from_side: "startup", created_at: "2026-09-03T00:00:00.000Z" }],
    });
    expect((r as { href?: string }).href).toBe("/deals");
    expect((r as { messageKey?: string }).messageKey).toBe("founderContact.proposalPending");
  });

  it("gives every founder refusal a link, whatever state the pair is in", async () => {
    const states: Db[] = [
      {},
      { deal_proposals: [{ id: "p1", startup_id: S, investor_id: I, status: "pending", from_side: "investor", created_at: "2026-09-03T00:00:00.000Z" }] },
      { deal_proposals: [{ id: "p2", startup_id: S, investor_id: I, status: "countered", from_side: "startup", created_at: "2026-09-03T00:00:00.000Z" }] },
      { deals: unsealedDeal, deal_seals: [] },
    ];
    for (const db of states) {
      const r = await founderRefusal(db);
      expect((r as { href?: string }).href, JSON.stringify(db).slice(0, 40)).toBeTruthy();
      expect((r as { ctaKey?: string }).ctaKey).toBeTruthy();
    }
  });

  it("keeps the two machine-readable refusals the messages client branches on", async () => {
    seed({ deals: unsealedDeal, deal_seals: [] });
    const sealV = await asInvestor();
    expect(contactRefusal(sealV as Extract<typeof sealV, { allowed: false }>).error).toBe("seal_required");
    seed({});
    const offerV = await asInvestor();
    const offer = contactRefusal(offerV as Extract<typeof offerV, { allowed: false }>);
    expect(offer.error).toBe("offer_required");
    expect((offer as { messageKey?: string }).messageKey).toBe("offer.required");
  });

  it("points the seal refusal at the deal that needs signing", async () => {
    seed({ deals: unsealedDeal, deal_seals: [signature("startup")] });
    const v = await asFounder();
    const r = contactRefusal(v as Extract<typeof v, { allowed: false }>);
    expect((r as { href?: string }).href).toBe(`/deals?deal=${DEAL}`);
    expect((r as { awaiting?: string[] }).awaiting).toEqual(["investor"]);
  });
});

describe("contactsUnlocked", () => {
  it("withholds details until the pair is sealed, and releases them after", async () => {
    seed({ deals: unsealedDeal, deal_seals: [signature("startup")] });
    expect(await contactsUnlocked({ startupId: S, investorId: I })).toBe(false);
    seed({ deals: unsealedDeal, deal_seals: [signature("startup"), signature("investor")] });
    expect(await contactsUnlocked({ startupId: S, investorId: I })).toBe(true);
  });

  it("withholds them when there is no deal at all, including for a grandfathered thread", async () => {
    seed({ threads: [{ id: "t1", startup_id: S, investor_id: I, created_at: "2026-08-20T00:00:00.000Z" }] });
    expect(await contactsUnlocked({ startupId: S, investorId: I })).toBe(false);
  });

  it("fails CLOSED, unlike the messaging gate: a published phone number is permanent", async () => {
    seed({ deals: unsealedDeal });
    h.state.clientFails = true;
    expect(await contactsUnlocked({ startupId: S, investorId: I })).toBe(false);
  });
});
