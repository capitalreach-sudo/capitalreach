import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { logSystemEvent } from "@/lib/system-events";
import { recordSignal } from "@/lib/trust-signals";
import {
  detectOffPlatformContact,
  offPlatformSeverity,
  type OffPlatformFinding,
} from "@/lib/introductions";

export const dynamic = "force-dynamic";

/**
 * The detection half of non-circumvention.
 *
 * A tail nobody watches expires quietly. The terms say a round closed with an
 * introduced investor inside 24 months is attributable to the platform, and
 * until now the only way that came to light was somebody mentioning it.
 *
 * This sweep raises LEADS, never verdicts. Everything it writes lands in
 * trust_signals for a human to read, and none of it suspends an account,
 * blocks a message, moves a trust level or bills anybody -- for the same
 * reason the rest of the trust layer refuses to: three of the patterns below
 * have entirely innocent explanations, and an automated accusation about
 * somebody's money is the worst possible thing to be wrong about.
 *
 * Three passes:
 *   1. contact details pushed into a message between an introduced pair;
 *   2. a pair that took heavy data-room access and then went silent with no
 *      deal ever opened here;
 *   3. a startup marking its round closed while introduced investors sit
 *      inside their tail with no deal recorded against them.
 *
 * Secured like /api/cron/follow-ups: a CRON_SECRET bearer, and the endpoint
 * stays shut rather than defaulting open when the secret is unset.
 */

/** Overlaps the daily cadence, so a slow run cannot open a gap. */
const SCAN_HOURS = 25;
/** Items disclosed before "they have seen everything" becomes true. */
const HEAVY_DISCLOSURES = 8;
/** Silence after that access, before it is worth a look. */
const QUIET_DAYS = 21;
/** How far back disclosure history is aggregated. */
const DISCLOSURE_LOOKBACK_DAYS = 120;
/** Only rounds closed recently -- an old closure must not re-flag forever. */
const ROUND_CLOSED_DAYS = 30;

const MAX_INTROS = 2000;
const MAX_MESSAGES = 1000;
const MAX_DISCLOSURES = 5000;
const MAX_CANDIDATES = 50;

interface IntroRow {
  id: string;
  startup_id: string;
  investor_id: string;
  first_contact_at: string;
  tail_ends_at: string;
}

const pairKey = (startupId: string, investorId: string) => `${startupId}|${investorId}`;

/**
 * A joined row comes back as an object or a one-element array depending on how
 * the FK is inferred. Read it the same way either way rather than betting.
 */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/circumvention-watch] CRON_SECRET is not set -- refusing to run.");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // Every pair still inside its tail. Outside the tail there is nothing to
  // claim, so there is nothing to look at either.
  const { data: introRows, error: introErr } = await admin
    .from("introductions")
    .select("id, startup_id, investor_id, first_contact_at, tail_ends_at")
    .gt("tail_ends_at", nowIso)
    .order("first_contact_at", { ascending: false })
    .limit(MAX_INTROS);

  if (introErr) {
    console.error("[cron/circumvention-watch]", introErr);
    await logSystemEvent("cron/circumvention-watch", "error", "Introductions query failed", { error: introErr.message });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const intros = (introRows ?? []) as IntroRow[];
  const byPair = new Map<string, IntroRow>();
  const byStartup = new Map<string, IntroRow[]>();
  for (const i of intros) {
    byPair.set(pairKey(i.startup_id, i.investor_id), i);
    const list = byStartup.get(i.startup_id) ?? [];
    list.push(i);
    byStartup.set(i.startup_id, list);
  }

  let offPlatform = 0;
  let quiet = 0;
  let closedElsewhere = 0;

  // ── Pass 1: contact details in a message between an introduced pair ───────
  //
  // The message itself is left completely alone. Swapping an email address is
  // how deals get done, and refusing the message would only teach both sides
  // to move the whole conversation somewhere that cannot be evidenced at all.
  // What the signal buys is that when a fee is later disputed, "they took it
  // off-platform on the 4th" is a record rather than a recollection.
  {
    const since = new Date(now - SCAN_HOURS * 3_600_000).toISOString();
    const [{ data: recent }, { data: priorSignals }] = await Promise.all([
      admin
        .from("messages")
        .select("id, sender_id, body, created_at, thread:threads(id, startup_id, investor_id)")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(MAX_MESSAGES),
      // Dedupe by the message that produced the finding: the scan window
      // deliberately overlaps the cadence, and a re-run must not raise the
      // same sentence twice against the same person.
      admin
        .from("trust_signals")
        .select("detail")
        .eq("signal", "offplatform_contact")
        .gte("created_at", new Date(now - 7 * 86_400_000).toISOString())
        .limit(2000),
    ]);

    const alreadyScanned = new Set(
      (priorSignals ?? [])
        .map((r) => (r.detail as { message_id?: string } | null)?.message_id)
        .filter((v): v is string => typeof v === "string"),
    );

    for (const msg of recent ?? []) {
      if (alreadyScanned.has(msg.id)) continue;
      const thread = one(msg.thread as unknown as { id: string; startup_id: string | null; investor_id: string | null });
      if (!thread?.startup_id || !thread?.investor_id) continue;
      const intro = byPair.get(pairKey(thread.startup_id, thread.investor_id));
      if (!intro) continue;

      const findings: OffPlatformFinding[] = detectOffPlatformContact(msg.body);
      if (!findings.length) continue;

      // On the SENDER's profile: it is a fact about the person who wrote it,
      // and computeRiskFlags already folds a profile's open signals into
      // whichever listing that person stands behind.
      await recordSignal("profile", msg.sender_id, "offplatform_contact", offPlatformSeverity(findings), {
        message_id: msg.id,
        thread_id: thread.id,
        startup_id: intro.startup_id,
        investor_id: intro.investor_id,
        introduction_id: intro.id,
        first_contact_at: intro.first_contact_at,
        tail_ends_at: intro.tail_ends_at,
        // Masked by the detector. The sentence itself stays in the message
        // row, which the parties own -- the queue does not need a second copy
        // of somebody's phone number to know where to look.
        findings,
      });
      offPlatform++;
    }
  }

  // Standing leads, so passes 2 and 3 do not re-raise a finding an admin has
  // already read. Keyed by subject and counterpart, not just by signal name:
  // a second investor going quiet on the same startup is a new fact.
  const { data: openReports } = await admin
    .from("trust_signals")
    .select("subject_type, subject_id, detail")
    .eq("signal", "circumvention_reported")
    .is("resolved_at", null)
    .limit(2000);
  const standing = new Set(
    (openReports ?? []).map((r) => {
      const d = (r.detail ?? {}) as { reason?: string; counterpart_id?: string };
      return `${r.subject_type}:${r.subject_id}:${d.reason ?? ""}:${d.counterpart_id ?? ""}`;
    }),
  );

  // ── Pass 2: everything read, then silence ────────────────────────────────
  //
  // A pair inside its tail where the investor was shown the whole room and
  // then stopped, with no deal ever opened here. The innocent reading is that
  // they passed and did not say so, which is why this is the lowest severity
  // of the three -- but it is also precisely the shape of a round that moved
  // off-platform, and nothing else on the system would ever surface it.
  {
    const lookback = new Date(now - DISCLOSURE_LOOKBACK_DAYS * 86_400_000).toISOString();
    const { data: disclosures } = await admin
      .from("nda_disclosures")
      .select("startup_id, investor_id, occurred_at")
      .gte("occurred_at", lookback)
      .order("occurred_at", { ascending: false })
      .limit(MAX_DISCLOSURES);

    const agg = new Map<string, { startupId: string; investorId: string; count: number; last: number }>();
    for (const d of disclosures ?? []) {
      const key = pairKey(d.startup_id, d.investor_id);
      if (!byPair.has(key)) continue;
      const at = new Date(d.occurred_at).getTime();
      const row = agg.get(key);
      if (row) {
        row.count++;
        if (at > row.last) row.last = at;
      } else {
        agg.set(key, { startupId: d.startup_id, investorId: d.investor_id, count: 1, last: at });
      }
    }

    const quietSince = now - QUIET_DAYS * 86_400_000;
    const candidates = Array.from(agg.values())
      .filter((r) => r.count >= HEAVY_DISCLOSURES && r.last < quietSince)
      .slice(0, MAX_CANDIDATES);

    if (candidates.length) {
      const startupIds = Array.from(new Set(candidates.map((c) => c.startupId)));
      const [{ data: deals }, { data: threads }] = await Promise.all([
        admin.from("deals").select("startup_id, investor_id").in("startup_id", startupIds).limit(1000),
        admin.from("threads").select("id, startup_id, investor_id").in("startup_id", startupIds).limit(1000),
      ]);
      const hasDeal = new Set((deals ?? []).map((d) => pairKey(d.startup_id, d.investor_id)));
      const threadPair = new Map<string, string>();
      for (const t of threads ?? []) {
        if (t.startup_id && t.investor_id) threadPair.set(t.id, pairKey(t.startup_id, t.investor_id));
      }

      // Latest message per pair, so "went quiet" means quiet everywhere and not
      // merely quiet in the data room.
      const lastMessage = new Map<string, number>();
      const threadIds = Array.from(threadPair.keys());
      if (threadIds.length) {
        const oldestQuiet = Math.min(...candidates.map((c) => c.last));
        const { data: msgs } = await admin
          .from("messages")
          .select("thread_id, created_at")
          .in("thread_id", threadIds)
          .gte("created_at", new Date(oldestQuiet).toISOString())
          .limit(2000);
        for (const m of msgs ?? []) {
          const key = threadPair.get(m.thread_id);
          if (!key) continue;
          const at = new Date(m.created_at).getTime();
          if (at > (lastMessage.get(key) ?? 0)) lastMessage.set(key, at);
        }
      }

      for (const c of candidates) {
        const key = pairKey(c.startupId, c.investorId);
        if (hasDeal.has(key)) continue;
        if ((lastMessage.get(key) ?? 0) > c.last) continue;
        if (standing.has(`investor:${c.investorId}:quiet_after_access:${c.startupId}`)) continue;
        const intro = byPair.get(key)!;
        await recordSignal("investor", c.investorId, "circumvention_reported", "low", {
          reason: "quiet_after_access",
          counterpart_id: c.startupId,
          startup_id: c.startupId,
          investor_id: c.investorId,
          introduction_id: intro.id,
          first_contact_at: intro.first_contact_at,
          tail_ends_at: intro.tail_ends_at,
          disclosures: c.count,
          last_disclosure_at: new Date(c.last).toISOString(),
          quiet_days: Math.floor((now - c.last) / 86_400_000),
        });
        quiet++;
      }
    }
  }

  // ── Pass 3: round closed, no deal against an introduced investor ─────────
  //
  // The founder's own lever says the round is done. If investors introduced
  // here are still inside their tail and no deal was ever opened with them,
  // either the round closed with somebody else entirely (fine, and common) or
  // it closed with one of them off-platform (the whole reason clause 2
  // exists). A reviewer can tell those apart in about a minute; nothing
  // automated can, so nothing automated decides.
  {
    const since = new Date(now - ROUND_CLOSED_DAYS * 86_400_000).toISOString();
    const { data: closedRounds } = await admin
      .from("startups")
      .select("id, name, round_state_changed_at")
      .eq("round_state", "closed")
      .gte("round_state_changed_at", since)
      .limit(200);

    const withIntros = (closedRounds ?? []).filter((s) => (byStartup.get(s.id) ?? []).length > 0);
    if (withIntros.length) {
      const startupIds = withIntros.map((s) => s.id);
      const [{ data: deals }, { data: threads }, { data: ndas }] = await Promise.all([
        admin.from("deals").select("startup_id, investor_id").in("startup_id", startupIds).limit(1000),
        admin.from("threads").select("startup_id, investor_id").in("startup_id", startupIds).limit(1000),
        admin.from("nda_records").select("startup_id, investor_id").in("startup_id", startupIds).limit(1000),
      ]);
      const dealPairs = new Set((deals ?? []).map((d) => pairKey(d.startup_id, d.investor_id)));
      // An introduction alone is not enough to raise this. A one-click interest
      // signal creates a pair; a conversation or a signed NDA is a pair that
      // actually got somewhere, and only those are worth a reviewer's time.
      const engaged = new Set<string>();
      for (const t of threads ?? []) if (t.startup_id && t.investor_id) engaged.add(pairKey(t.startup_id, t.investor_id));
      for (const n of ndas ?? []) engaged.add(pairKey(n.startup_id, n.investor_id));

      for (const s of withIntros) {
        if (standing.has(`startup:${s.id}:round_closed_no_deal:`)) continue;
        const undealt = (byStartup.get(s.id) ?? []).filter((i) => {
          const key = pairKey(i.startup_id, i.investor_id);
          return !dealPairs.has(key) && engaged.has(key);
        });
        if (!undealt.length) continue;
        await recordSignal("startup", s.id, "circumvention_reported", "medium", {
          reason: "round_closed_no_deal",
          startup: s.name,
          round_closed_at: s.round_state_changed_at,
          introduced_investors: undealt.slice(0, 20).map((i) => ({
            investor_id: i.investor_id,
            introduction_id: i.id,
            first_contact_at: i.first_contact_at,
            tail_ends_at: i.tail_ends_at,
          })),
          introduced_in_tail: undealt.length,
        });
        closedElsewhere++;
      }
    }
  }

  // A heartbeat either way: the difference between "quiet because nothing was
  // found" and "quiet because it has not run since June" is exactly what the
  // system_events table exists to expose.
  await logSystemEvent("cron/circumvention-watch", "info", "Run completed", {
    intros: intros.length,
    offPlatform,
    quiet,
    closedElsewhere,
  });

  return NextResponse.json({ ok: true, intros: intros.length, offPlatform, quiet, closedElsewhere });
}
