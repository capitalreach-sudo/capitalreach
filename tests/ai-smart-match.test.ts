import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Smart match ("startups → investors") is not a messaging surface — it opens
 * no thread and passes no sealState check — but it answers the same question
 * a founder would otherwise need Messages to answer: who is this investor,
 * really. Audit finding: the investor query had no is_public filter and
 * joined profiles.full_name, so it handed a founder the account holder's real
 * name (not the display_name/firm_name the investor chose to publish) for
 * every investor row, private or public. That is the identity the rest of
 * the platform prices at a sealed deal (see lib/contact-policy.ts, and
 * /api/messages/accounts's maskName treatment of founders); a matching tool
 * that leaks it for free is a circumvention path with a percentage score
 * attached. This test seeds a private investor with a distinct profile name
 * and asserts neither survives into the response.
 */

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

const h = vi.hoisted(() => {
  const state: { db: Db } = { db: {} };

  function client() {
    return {
      auth: {
        getUser: async () => ({ data: { user: { id: state.db.__userId?.[0]?.id ?? null } }, error: null }),
      },
      from(table: string) {
        let rows = (state.db[table] ?? []).slice();
        const b = {
          select: () => b,
          eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return b; },
          not: (col: string, op: string, val: unknown) => {
            if (op !== "is" || val !== null) throw new Error(`unsupported not(): ${op}`);
            rows = rows.filter((r) => r[col] !== null && r[col] !== undefined);
            return b;
          },
          limit: (n: number) => { rows = rows.slice(0, n); return b; },
          maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
          single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } }),
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
  createAdminClient: () => h.client(),
  createServerSupabaseClient: async () => h.client(),
}));

import * as route from "@/app/api/ai/smart-match/route";

const FOUNDER = "00000000-0000-4000-8000-000000000001";
const PUBLIC_INVESTOR = "11111111-1111-4111-8111-111111111111";
const PRIVATE_INVESTOR = "22222222-2222-4222-8222-222222222222";

function seed() {
  h.state.db = {
    profiles: [
      { id: FOUNDER, role: "startup", subscription_tier: "starter", suspended: false, account_status: "active" },
    ],
    startups: [{ owner_id: FOUNDER, subscription_tier: "starter" }],
    investors: [
      {
        id: PUBLIC_INVESTOR, slug: "public-vc", type: "vc",
        industries: ["B2B SaaS"], stages: ["seed"], min_check: 50_000, max_check: 500_000,
        geography: ["US"], is_external: false, is_public: true,
        display_name: "Public Ventures", firm_name: "Public Ventures LLC",
      },
      {
        // Never opted into the directory (is_public: false) — the investor
        // profile page 404s this row for anyone but its owner. Its
        // profiles.full_name is deliberately the standout value here: if it
        // ever reaches the response, the test's own name would give it away.
        id: PRIVATE_INVESTOR, slug: "private-angel", type: "angel",
        industries: ["B2B SaaS"], stages: ["seed"], min_check: 25_000, max_check: 250_000,
        geography: ["US"], is_external: false, is_public: false,
        display_name: "Private Angel", firm_name: null,
      },
    ],
  };
}

function post(body: Record<string, unknown>) {
  (h.state.db as Db & { __userId?: Row[] }).__userId = [{ id: FOUNDER }];
  return route.POST(new Request("https://capitalreach.vercel.app/api/ai/smart-match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any);
}

describe("smart-match identity protection", () => {
  beforeEach(seed);

  it("never returns a private (is_public: false) investor", async () => {
    const res = await post({ industry: "B2B SaaS", stage: "Seed", mrr: "$0–10k" });
    const json = await res.json();
    expect(res.status).toBe(200);
    const ids = (json.matches as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(PUBLIC_INVESTOR);
    expect(ids).not.toContain(PRIVATE_INVESTOR);
  });

  it("names a match from its published display/firm name, never a personal profile name", async () => {
    // A distinguishing real name that must never surface — the route no
    // longer joins profiles at all, so this row does nothing but prove it.
    h.state.db.profiles!.push({ id: "owner-of-public", full_name: "Sarah Personalname" });
    const res = await post({ industry: "B2B SaaS", stage: "Seed", mrr: "$0–10k" });
    const json = await res.json();
    const match = (json.matches as Array<{ id: string; name: string }>).find((m) => m.id === PUBLIC_INVESTOR);
    expect(match?.name).toBe("Public Ventures");
    const names = (json.matches as Array<{ name: string }>).map((m) => m.name);
    expect(names).not.toContain("Sarah Personalname");
  });
});
