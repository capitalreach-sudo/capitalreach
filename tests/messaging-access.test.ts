import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Who has Messages at all. A member has them only through a sealed deal they
 * are party to (as owner or through a team seat), and only with that deal's
 * counterpart; an admin always has them. Anything unreadable means no.
 */

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

const h = vi.hoisted(() => {
  const state: { db: Db; clientFails: boolean } = { db: {}, clientFails: false };

  // The or() terms lib/threads builds: `col.in.(a,b)` and `col.eq.value`.
  function matchesTerm(row: Row, term: string): boolean {
    const inTerm = /^(\w+)\.in\.\((.*)\)$/.exec(term);
    if (inTerm) return inTerm[2].split(",").includes(String(row[inTerm[1]] ?? ""));
    const eqTerm = /^(\w+)\.eq\.(.*)$/.exec(term);
    if (eqTerm) return String(row[eqTerm[1]] ?? "") === eqTerm[2];
    throw new Error(`unsupported or() term: ${term}`);
  }

  function splitTerms(filter: string): string[] {
    const out: string[] = [];
    let depth = 0, cur = "";
    for (const ch of filter) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  function client() {
    return {
      from(table: string) {
        let rows = (state.db[table] ?? []).slice();
        const b = {
          select: () => b,
          eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return b; },
          in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return b; },
          not: (col: string, op: string, val: unknown) => {
            if (op !== "is" || val !== null) throw new Error(`unsupported not(): ${op}`);
            rows = rows.filter((r) => r[col] !== null && r[col] !== undefined);
            return b;
          },
          or: (filter: string) => { rows = rows.filter((r) => splitTerms(filter).some((t) => matchesTerm(r, t))); return b; },
          limit: (n: number) => { rows = rows.slice(0, n); return b; },
          maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
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

import {
  messagingAvailable, messagingAccess, sealedCounterpartPairs, threadOpenFor, usableThreadIds,
} from "@/lib/messaging-access";

const FOUNDER = "00000000-0000-4000-8000-000000000001";
const PARTNER = "00000000-0000-4000-8000-000000000002";
const ASSOCIATE = "00000000-0000-4000-8000-000000000003";
const ADMIN = "00000000-0000-4000-8000-000000000004";
const STRANGER = "00000000-0000-4000-8000-000000000005";
/** Names the addressee of the admin-authored thread fixture (T_F2F), kept
 *  distinct from STRANGER so the "has genuinely nothing" tests stay clean. */
const RECIPIENT = "00000000-0000-4000-8000-000000000006";

const S = "11111111-1111-4111-8111-111111111111";
const S2 = "11111111-1111-4111-8111-222222222222";
const S3 = "11111111-1111-4111-8111-333333333333";
/** The admin's own entity: real admin-authored threads always carry the
 *  admin's own entity in the non-recipient slot (deals/share inserts
 *  investor_id: me.id, the sender), never an unrelated member's. */
const SA = "11111111-1111-4111-8111-444444444444";
const I = "22222222-2222-4222-8222-222222222222";
const I2 = "22222222-2222-4222-8222-333333333333";

const T_PAIR = "33333333-3333-4333-8333-000000000001";
const T_UNSEALED = "33333333-3333-4333-8333-000000000002";
const T_PEER = "33333333-3333-4333-8333-000000000003";
const T_F2F = "33333333-3333-4333-8333-000000000004";

function seed(over: Partial<Db> = {}) {
  h.state.db = {
    profiles: [
      { id: FOUNDER, role: "startup" },
      { id: PARTNER, role: "investor" },
      { id: ASSOCIATE, role: "investor" },
      { id: ADMIN, role: "admin" },
      { id: STRANGER, role: "startup" },
      { id: RECIPIENT, role: "startup" },
    ],
    startups: [
      { id: S, owner_id: FOUNDER },
      { id: S2, owner_id: STRANGER },
      { id: S3, owner_id: RECIPIENT },
      { id: SA, owner_id: ADMIN },
    ],
    investors: [
      { id: I, owner_id: PARTNER },
      { id: I2, owner_id: null },
    ],
    team_members: [{ entity_type: "investor", entity_id: I, user_id: ASSOCIATE }],
    deals: [
      { id: "d1", startup_id: S, investor_id: I, sealed_at: "2026-09-12T00:00:00.000Z" },
      { id: "d2", startup_id: S2, investor_id: I2, sealed_at: null },
    ],
    threads: [
      { id: T_PAIR, startup_id: S, investor_id: I, recipient_startup_id: null, recipient_investor_id: null },
      { id: T_UNSEALED, startup_id: S, investor_id: I2, recipient_startup_id: null, recipient_investor_id: null },
      { id: T_PEER, startup_id: null, investor_id: I, recipient_startup_id: null, recipient_investor_id: I2 },
      // Only ever reachable through the admin-only branches of deals/share and
      // messages/start, so a real row of this shape always carries the
      // admin's OWN entity (SA) in the non-recipient slot and the member it
      // is addressed to (S3, owned by RECIPIENT) in the recipient slot.
      { id: T_F2F, startup_id: SA, investor_id: null, recipient_startup_id: S3, recipient_investor_id: null },
    ],
    ...over,
  };
}

beforeEach(() => {
  seed();
  h.state.clientFails = false;
});

describe("messagingAvailable", () => {
  it("is true for both owners of a sealed deal", async () => {
    expect(await messagingAvailable(FOUNDER)).toBe(true);
    expect(await messagingAvailable(PARTNER)).toBe(true);
  });

  it("is true for a team seat on a party to a sealed deal", async () => {
    expect(await messagingAvailable(ASSOCIATE)).toBe(true);
  });

  it("is false when the only deal is unsealed", async () => {
    expect(await messagingAvailable(STRANGER)).toBe(false);
  });

  it("is false for a member with no entity at all", async () => {
    expect(await messagingAvailable("00000000-0000-4000-8000-00000000ffff")).toBe(false);
  });

  it("is true for an admin with no deals", async () => {
    h.state.db.deals = [];
    expect(await messagingAvailable(ADMIN)).toBe(true);
  });

  it("does not count a seat on an entity outside the sealed deal", async () => {
    h.state.db.team_members = [{ entity_type: "startup", entity_id: S2, user_id: ASSOCIATE }];
    expect(await messagingAvailable(ASSOCIATE)).toBe(false);
  });

  it("is true for a member with no sealed deal but an admin-authored thread naming them", async () => {
    expect(await messagingAvailable(RECIPIENT)).toBe(true);
  });

  it("is false when nothing can be read", async () => {
    h.state.clientFails = true;
    expect(await messagingAvailable(FOUNDER)).toBe(false);
    expect(await messagingAvailable(ADMIN)).toBe(false);
  });
});

describe("sealedCounterpartPairs", () => {
  it("lists the sealed pair once, from either side", async () => {
    expect(await sealedCounterpartPairs(FOUNDER)).toEqual([{ startupId: S, investorId: I }]);
    expect(await sealedCounterpartPairs(PARTNER)).toEqual([{ startupId: S, investorId: I }]);
  });

  it("lists nothing for an unsealed deal", async () => {
    expect(await sealedCounterpartPairs(STRANGER)).toEqual([]);
  });

  it("is empty when nothing can be read", async () => {
    h.state.clientFails = true;
    expect(await sealedCounterpartPairs(FOUNDER)).toEqual([]);
  });
});

describe("threadOpenFor", () => {
  const sealed = [{ startupId: S, investorId: I }];

  it("opens the sealed pair's own thread", () => {
    expect(threadOpenFor({ startup_id: S, investor_id: I }, sealed)).toBe(true);
  });

  it("keeps a pair with no sealed deal closed", () => {
    expect(threadOpenFor({ startup_id: S, investor_id: I2 }, sealed)).toBe(false);
  });

  it("keeps a thread with a second party closed with no viewer given", () => {
    expect(threadOpenFor({ startup_id: S, investor_id: I, recipient_investor_id: I2 }, sealed)).toBe(false);
    expect(threadOpenFor({ startup_id: S, investor_id: I, recipient_startup_id: S2 }, sealed)).toBe(false);
    expect(threadOpenFor({ startup_id: null, investor_id: I, recipient_investor_id: I2 }, sealed)).toBe(false);
  });

  it("keeps a thread with a second party closed for a viewer named on neither side", () => {
    const stranger = { startupIds: new Set([S2]), investorIds: new Set<string>() };
    expect(threadOpenFor({ startup_id: SA, investor_id: null, recipient_startup_id: S3 }, sealed, stranger)).toBe(false);
  });

  it("opens a thread with a second party for the entity it names, on either side", () => {
    const admin = { startupIds: new Set([SA]), investorIds: new Set<string>() };
    const recipient = { startupIds: new Set([S3]), investorIds: new Set<string>() };
    const thread = { startup_id: SA, investor_id: null, recipient_startup_id: S3 };
    expect(threadOpenFor(thread, sealed, admin)).toBe(true);
    expect(threadOpenFor(thread, sealed, recipient)).toBe(true);
  });
});

describe("usableThreadIds", () => {
  it("gives a member only the sealed pair's thread", async () => {
    const access = await messagingAccess(FOUNDER);
    expect(await usableThreadIds(FOUNDER, access)).toEqual([T_PAIR]);
  });

  it("gives a member with nothing sealed and no admin thread no threads", async () => {
    const access = await messagingAccess(STRANGER);
    expect(await usableThreadIds(STRANGER, access)).toEqual([]);
  });

  it("gives a member with no sealed deal the admin-authored thread addressed to them", async () => {
    const access = await messagingAccess(RECIPIENT);
    expect(access.pairs).toEqual([]);
    expect(await usableThreadIds(RECIPIENT, access)).toEqual([T_F2F]);
  });

  it("leaves an admin's own threads unfiltered", async () => {
    h.state.db.startups = [{ id: S, owner_id: ADMIN }, { id: SA, owner_id: ADMIN }];
    const access = await messagingAccess(ADMIN);
    expect(access.admin).toBe(true);
    expect((await usableThreadIds(ADMIN, access)).sort()).toEqual([T_PAIR, T_UNSEALED, T_F2F].sort());
  });
});
