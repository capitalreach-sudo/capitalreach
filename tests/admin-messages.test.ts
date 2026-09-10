import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The surface that reads private correspondence, tested through the route
 * rather than around it.
 *
 * The interesting logic here is not a function, it is an ORDER: the audit entry
 * has to be on disk before a message body is fetched, and a failed entry has to
 * cost the reader the content. A unit test of a shaper would assert none of
 * that, so the Supabase client is replaced by an in-memory table set and the
 * handler runs for real -- including the real requireAdmin, so the level gate
 * is exercised rather than described. The trace records the order tables were
 * touched in, which is the only way to assert "the log came first".
 */

type Row = Record<string, any>;
type Db = Record<string, Row[]>;

const h = vi.hoisted(() => {
  const state: { db: Db; userId: string | null; auditFails: boolean; trace: string[] } = {
    db: {}, userId: null, auditFails: false, trace: [],
  };

  function matches(row: Row, term: string): boolean {
    // Only the `col.eq.value` form the route builds. A term this cannot read
    // must fail loudly rather than quietly matching everything.
    const m = /^(\w+)\.eq\.(.*)$/.exec(term);
    if (!m) throw new Error(`unsupported or() term: ${term}`);
    return String(row[m[1]] ?? "") === m[2];
  }

  function client() {
    return {
      auth: {
        getUser: async () => ({
          data: { user: state.userId ? { id: state.userId } : null },
          error: null,
        }),
      },
      from(table: string) {
        let rows = (state.db[table] ?? []).slice();
        let range: [number, number] | null = null;
        const b: any = {
          select: (_cols?: string, _opts?: { count?: string }) => { state.trace.push(`${table}:select`); return b; },
          eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return b; },
          in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return b; },
          or: (filter: string) => { rows = rows.filter((r) => filter.split(",").some((term) => matches(r, term))); return b; },
          order: (col: string, opts?: { ascending?: boolean }) => {
            const dir = opts?.ascending === false ? -1 : 1;
            rows = rows.slice().sort((x, y) => {
              const a = String(x[col] ?? ""), c = String(y[col] ?? "");
              return a === c ? 0 : (a < c ? -1 : 1) * dir;
            });
            return b;
          },
          limit: (n: number) => { rows = rows.slice(0, n); return b; },
          // Lazy, because the exact count PostgREST returns alongside a range
          // is the count BEFORE the slice.
          range: (from: number, to: number) => { range = [from, to]; return b; },
          maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
          insert: (row: Row) => {
            state.trace.push(`${table}:insert`);
            const failed = state.auditFails && table === "admin_actions";
            if (!failed) (state.db[table] = state.db[table] ?? []).push({ ...row });
            return Promise.resolve({ data: null, error: failed ? { message: "insert refused" } : null });
          },
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
            const count = rows.length;
            const data = range ? rows.slice(range[0], range[1] + 1) : rows;
            return Promise.resolve({ data, error: null, count }).then(resolve, reject);
          },
        };
        return b;
      },
    };
  }

  return { state, client };
});

vi.mock("@/lib/supabase-server", () => ({
  createAdminClient: () => h.client(),
  createServerSupabaseClient: async () => h.client(),
}));

import * as route from "@/app/api/admin/messages/route";

const OPERATOR = "00000000-0000-4000-8000-000000000001";
const SUPPORT = "00000000-0000-4000-8000-000000000002";
const FOUNDER = "00000000-0000-4000-8000-000000000003";
const PARTNER = "00000000-0000-4000-8000-000000000004";
const ASSOCIATE = "00000000-0000-4000-8000-000000000005";
const STARTUP = "11111111-1111-4111-8111-111111111111";
const INVESTOR = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const OTHER_THREAD = "44444444-4444-4444-8444-444444444444";

const WITHHELD = "[contact details withheld until a deal is open]";

const admins = [
  { id: OPERATOR, role: "admin", suspended: false, account_status: "active", admin_level: "operator" },
  { id: SUPPORT, role: "admin", suspended: false, account_status: "active", admin_level: "support" },
];

/** m2 is the one that matters: delivered text, the sentence as typed, and the
 *  kinds that were taken out of it. */
const messages = [
  {
    id: "aaaaaaaa-0000-4000-8000-00000000000a", thread_id: THREAD, sender_id: FOUNDER,
    created_at: "2026-08-01T09:00:00.000Z", body: "Thanks for the call.",
    body_original: null, safety_flags: null, attachment_name: null,
  },
  {
    id: "bbbbbbbb-0000-4000-8000-00000000000b", thread_id: THREAD, sender_id: PARTNER,
    created_at: "2026-08-02T09:00:00.000Z", body: `Reach me at ${WITHHELD} instead.`,
    body_original: "Reach me at partner@northgate.example instead.",
    safety_flags: { masked: ["email"], scam: [] }, attachment_name: null,
  },
  {
    id: "cccccccc-0000-4000-8000-00000000000c", thread_id: THREAD, sender_id: ASSOCIATE,
    created_at: "2026-08-03T09:00:00.000Z", body: "Sending the model over.",
    // A row from before body_original was only written on a real change.
    body_original: "Sending the model over.", safety_flags: null, attachment_name: "model.xlsx",
  },
];

function seed(over: Partial<Db> = {}) {
  h.state.db = {
    profiles: [
      ...admins,
      { id: FOUNDER, full_name: "Ada Founder" },
      { id: PARTNER, full_name: "Bo Partner" },
      { id: ASSOCIATE, full_name: "Cy Associate" },
    ],
    startups: [{ id: STARTUP, name: "Northwind", slug: "northwind", owner_id: FOUNDER }],
    investors: [{ id: INVESTOR, display_name: "Northgate Capital", firm_name: null, slug: "northgate", owner_id: PARTNER }],
    threads: [
      { id: THREAD, status: "active", created_at: "2026-08-01T08:00:00.000Z", updated_at: "2026-08-03T09:00:00.000Z",
        startup_id: STARTUP, investor_id: INVESTOR, recipient_startup_id: null, recipient_investor_id: null },
      { id: OTHER_THREAD, status: "archived", created_at: "2026-07-01T08:00:00.000Z", updated_at: "2026-07-01T08:00:00.000Z",
        startup_id: null, investor_id: INVESTOR, recipient_startup_id: null, recipient_investor_id: null },
    ],
    messages,
    team_members: [{ entity_type: "investor", entity_id: INVESTOR, user_id: ASSOCIATE, role: "member" }],
    admin_actions: [],
    ...over,
  };
}

const get = (query: string) =>
  route.GET(new Request(`https://capitalreach.vercel.app/api/admin/messages${query}`) as any);

const threadsOf = (member = `?subjectType=startup&subjectId=${STARTUP}`) => get(member);
const readThread = () => get(`?memberType=startup&memberId=${STARTUP}&threadId=${THREAD}`);

const auditRows = () => (h.state.db.admin_actions ?? []);

beforeEach(() => {
  seed();
  h.state.userId = OPERATOR;
  h.state.auditFails = false;
  h.state.trace = [];
});

describe("who may read correspondence", () => {
  it("refuses a signed-out caller", async () => {
    h.state.userId = null;
    expect((await threadsOf()).status).toBe(401);
  });

  it("refuses support, the level an admin row defaults to", async () => {
    // Reading the platform's own record of itself is a support job. Two
    // members' private messages are not the platform's record of itself.
    h.state.userId = SUPPORT;
    const res = await threadsOf();
    expect(res.status).toBe(403);
    expect(auditRows()).toHaveLength(0);
  });

  it("admits an operator", async () => {
    expect((await threadsOf()).status).toBe(200);
  });
});

describe("a member's threads", () => {
  it("names the counterpart and counts what was withheld, without loading a body", async () => {
    const body = await (await threadsOf()).json();
    expect(body.threads).toHaveLength(1);
    const th = body.threads[0];
    expect(th.id).toBe(THREAD);
    expect(th.counterpartyName).toBe("Northgate Capital");
    expect(th.counterpart).toMatchObject({ kind: "investor", id: INVESTOR });
    expect(th.messageCount).toBe(3);
    expect(th.lastMessageAt).toBe("2026-08-03T09:00:00.000Z");
    expect(th.maskedCount).toBe(1);
    expect(th.everMasked).toBe(true);
    // The listing is a register, not a transcript: no message text belongs in
    // it, and nobody should be able to read the platform by paging the list.
    expect(JSON.stringify(body)).not.toContain("Reach me at");
  });

  it("finds the threads a member only receives", async () => {
    const body = await (await get(`?subjectType=investor&subjectId=${INVESTOR}`)).json();
    expect(body.threads.map((t: any) => t.id).sort()).toEqual([THREAD, OTHER_THREAD].sort());
  });

  it("is a 404 for a member that does not exist, and logs nothing", async () => {
    const res = await get(`?subjectType=startup&subjectId=${OTHER_THREAD}`);
    expect(res.status).toBe(404);
    expect(auditRows()).toHaveLength(0);
  });

  it("refuses an id that is not a uuid rather than building a filter from it", async () => {
    expect((await get("?subjectType=startup&subjectId=1;drop")).status).toBe(400);
    expect((await get("?subjectType=nonsense&subjectId=" + STARTUP)).status).toBe(400);
  });
});

describe("the log comes first", () => {
  it("writes the audit entry before it fetches a single message", async () => {
    await readThread();
    const logged = h.state.trace.indexOf("admin_actions:insert");
    const read = h.state.trace.indexOf("messages:select");
    expect(logged).toBeGreaterThanOrEqual(0);
    expect(read).toBeGreaterThan(logged);
  });

  it("names the member, the thread and both parties", async () => {
    await readThread();
    expect(auditRows()).toHaveLength(1);
    const entry = auditRows()[0];
    expect(entry).toMatchObject({
      admin_id: OPERATOR, action: "read_messages", target_type: "startup", target_id: STARTUP, note: "Northwind",
    });
    expect(entry.details.thread_id).toBe(THREAD);
    expect(entry.details.parties).toEqual([
      { kind: "startup", id: STARTUP },
      { kind: "investor", id: INVESTOR },
    ]);
  });

  it("returns nothing when the entry cannot be written", async () => {
    h.state.auditFails = true;
    const res = await readThread();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.messages).toBeUndefined();
    // The point of the whole design: an unlogged read does not happen.
    expect(JSON.stringify(body)).not.toContain("partner@northgate.example");
    expect(h.state.trace).not.toContain("messages:select");
  });

  it("still refuses on the second failure, with a body that can be read", async () => {
    // A response body is a one-shot stream, so a refusal hoisted to a module
    // constant comes back consumed for the next caller on a warm lambda.
    h.state.auditFails = true;
    expect((await (await readThread()).json()).error).toBeTruthy();
    const second = await readThread();
    expect(second.status).toBe(500);
    expect((await second.json()).error).toBeTruthy();
  });

  it("logs the listing too, naming the member", async () => {
    await threadsOf();
    expect(auditRows()[0]).toMatchObject({ action: "read_messages", target_type: "startup", target_id: STARTUP });
  });
});

describe("what was delivered, and what was withheld", () => {
  it("returns both, separately, where the mask changed the text", async () => {
    const body = await (await readThread()).json();
    const masked = body.messages.find((m: any) => m.id.startsWith("bbbb"));
    expect(masked.body).toContain(WITHHELD);
    expect(masked.body).not.toContain("partner@northgate.example");
    expect(masked.bodyOriginal).toBe("Reach me at partner@northgate.example instead.");
    expect(masked.maskedKinds).toEqual(["email"]);
  });

  it("says nothing was withheld when nothing was", async () => {
    const body = await (await readThread()).json();
    const plain = body.messages.find((m: any) => m.id.startsWith("aaaa"));
    expect(plain.bodyOriginal).toBeNull();
    expect(plain.maskedKinds).toEqual([]);
  });

  it("does not call an identical stored copy a withholding", async () => {
    // Told text was withheld and shown the same sentence twice, an admin
    // learns to ignore the label.
    const body = await (await readThread()).json();
    const legacy = body.messages.find((m: any) => m.id.startsWith("cccc"));
    expect(legacy.bodyOriginal).toBeNull();
    expect(legacy.maskedKinds).toEqual([]);
    expect(legacy.attachmentName).toBe("model.xlsx");
  });
});

describe("which side each message came from", () => {
  it("reads oldest first and attributes every sender to a side", async () => {
    const body = await (await readThread()).json();
    expect(body.messages.map((m: any) => m.senderName)).toEqual(["Ada Founder", "Bo Partner", "Cy Associate"]);
    expect(body.messages.map((m: any) => m.sender.kind)).toEqual(["startup", "investor", "investor"]);
  });

  it("attributes an associate to the firm, not to nobody", async () => {
    const body = await (await readThread()).json();
    const fromAssociate = body.messages.find((m: any) => m.id.startsWith("cccc"));
    expect(fromAssociate.sender.partyId).toBe(INVESTOR);
    expect(fromAssociate.fromMember).toBe(false);
  });

  it("marks the inspected member's own messages", async () => {
    const body = await (await readThread()).json();
    expect(body.messages.map((m: any) => m.fromMember)).toEqual([true, false, false]);
  });

  it("leaves a departed sender on no side rather than guessing one", async () => {
    h.state.db.team_members = [];
    const body = await (await readThread()).json();
    const orphan = body.messages.find((m: any) => m.id.startsWith("cccc"));
    expect(orphan.sender.kind).toBeNull();
    expect(orphan.senderName).toBe("Cy Associate");
  });
});

describe("volume", () => {
  it("caps a page however much is asked for", async () => {
    const body = await (await get(`?memberType=startup&memberId=${STARTUP}&threadId=${THREAD}&limit=4000`)).json();
    expect(body.page.limit).toBe(200);
  });

  it("pages rather than handing over the whole conversation", async () => {
    const body = await (await get(`?threadId=${THREAD}&limit=2`)).json();
    expect(body.messages).toHaveLength(2);
    expect(body.page).toMatchObject({ limit: 2, offset: 0, total: 3, hasMore: true });

    const second = await (await get(`?threadId=${THREAD}&limit=2&offset=2`)).json();
    expect(second.messages).toHaveLength(1);
    expect(second.page.hasMore).toBe(false);
  });

  it("ignores junk paging instead of failing on it", async () => {
    const body = await (await get(`?threadId=${THREAD}&limit=abc&offset=-5`)).json();
    expect(body.page).toMatchObject({ limit: 100, offset: 0 });
  });
});

describe("no write path", () => {
  it("exports no handler that could change a message", () => {
    // Next answers an unexported method with 405. This is the whole of the
    // guarantee that an admin can read this correspondence but never join it.
    expect(route).not.toHaveProperty("POST");
    expect(route).not.toHaveProperty("PATCH");
    expect(route).not.toHaveProperty("DELETE");
    expect(route).not.toHaveProperty("PUT");
    expect(typeof route.GET).toBe("function");
  });
});
