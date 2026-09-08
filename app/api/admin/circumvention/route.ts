import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";
import { isUuid } from "@/lib/utils";
import { withinTail } from "@/lib/introductions";
import { CIRCUMVENTION_TERMS_VERSION, NON_CIRCUMVENTION_MONTHS } from "@/lib/circumvention-text";
import type { CounterpartySnapshot } from "@/lib/nda-record";

/**
 * The case file.
 *
 * A suspected leak arrives as scattered rows: a signal from the nightly sweep,
 * an introduction from eight months ago, an NDA nobody has read since it was
 * signed, a disclosure log, and -- sometimes -- a founder's own dated statement
 * about how the round ended. Answering "did this round go around us?" by
 * opening five tables in five tabs is how a reviewer ends up deciding on the
 * first two facts they happen to find.
 *
 * So this route assembles ONE dossier per (startup, investor) pair: every dated
 * fact the platform holds about that pair, in one payload, in the order the
 * facts happened. It draws no conclusion and it cannot: nothing here suspends
 * an account, bills anybody, or asserts fraud. GET reads the record; POST marks
 * a lead reviewed with a note and resolves the signals underneath it. That is
 * the whole surface.
 *
 * Security. Every table read here -- trust_signals, introductions, nda_records,
 * nda_disclosures, round_closures, circumvention_acks -- has RLS enabled with
 * no permissive policy, so none of it is reachable with a client key at all.
 * The service-role client behind requireAdmin("operator") is the only way in,
 * and every listing is written to the admin log, because "who read whose
 * disclosure history" is an auditable question.
 *
 * Two things never leave here. Raw email addresses: the NDA counterparty
 * snapshot already names the people who were bound, and a second copy of
 * somebody's address in a risk queue is a second copy to leak. And the
 * financial columns of `startups`, revoked from client keys in migration 109 --
 * the only money in this response is what a founder themself declared on a
 * round_closures row, quoted back as their statement.
 */

export const dynamic = "force-dynamic";

/**
 * The signals that describe a possible leak. Everything else in trust_signals
 * (disposable email, impossible metrics, sanctions) is the verification
 * bench's business; mixing them in here would turn a focused record into a
 * general suspicion list about the same people.
 */
const LEAD_SIGNALS = ["circumvention_reported", "offplatform_contact", "nda_bulk_download"] as const;

/** Open signals scanned per listing. Well past what a real queue holds. */
const MAX_SIGNALS = 400;
/** Case files assembled per listing. A bench works a screen at a time. */
const MAX_CASES = 40;
/** Disclosure rows aggregated. Past this the count renders as what was
 *  scanned, which is still the honest answer to "how much did they take". */
const DISCLOSURE_SCAN_CAP = 4000;
const MESSAGE_SCAN_CAP = 5000;
/** Log entries returned per pair. The count is separate from the list. */
const DISCLOSURES_SHOWN = 60;
const DECLARATIONS_SHOWN = 5;
/** Dated facts in the ledger. Beyond this it stops being readable. */
const TIMELINE_MAX = 28;

type Detail = Record<string, unknown>;

interface SignalRow {
  id: string;
  subject_type: string;
  subject_id: string;
  signal: string;
  severity: string;
  detail: unknown;
  created_at: string;
}

const pairKey = (startupId: string, investorId: string) => `${startupId}|${investorId}`;

function uuid(v: unknown): string | null {
  return isUuid(v) ? v : null;
}

function detailOf(row: SignalRow): Detail {
  return row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)
    ? (row.detail as Detail)
    : {};
}

/**
 * Which pairs one signal is about.
 *
 * The detail column is jsonb written by four different callers over three
 * migrations, so it is read defensively and in every shape those callers
 * actually use: the round-closure route names its undeclared investors in an
 * array, the nightly sweep names one counterpart, the message routes write
 * `startupId` in camelCase, and two of them lean on the subject id for half
 * the pair. A signal whose pair cannot be resolved is not a case file -- it is
 * counted in the audit entry and otherwise left alone.
 */
function pairsFrom(row: SignalRow): Array<{ startupId: string; investorId: string }> {
  const d = detailOf(row);

  const startupId =
    uuid(d.startup_id) ??
    uuid(d.startupId) ??
    (row.subject_type === "startup" ? uuid(row.subject_id) : null) ??
    uuid(d.counterpart_id);
  if (!startupId) return [];

  const investors = new Set<string>();
  if (row.subject_type === "investor") {
    const own = uuid(row.subject_id);
    if (own) investors.add(own);
  }
  for (const key of ["investor_id", "investorId"]) {
    const v = uuid(d[key]);
    if (v) investors.add(v);
  }
  for (const key of ["undeclared", "introduced_investors"]) {
    const list = d[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const v = uuid((item as Detail).investor_id);
      if (v) investors.add(v);
    }
  }

  return Array.from(investors).map((investorId) => ({ startupId, investorId }));
}

// ── The dossier shapes ──────────────────────────────────────────────────────
//
// Not exported: a route module may only export its handlers, so the queue
// component declares the mirror of these on its own side.

interface CaseSignal {
  id: string;
  signal: string;
  severity: string;
  /** The sweep's own word for the pattern, where it wrote one. */
  reason: string | null;
  subjectType: string;
  createdAt: string;
  /** Masked contact kinds from detectOffPlatformContact, when there are any.
   *  Never the excerpts: the sentence stays in the message the parties own. */
  contactKinds: string[];
  /**
   * How many OTHER introduced investors this one signal also names.
   *
   * The round-level findings are written once against the startup and list
   * every investor the cross-check turned up, so one row can be the lead
   * behind five case files. Closing any of them closes the row for all of
   * them, and a reviewer who has read one investor's file must be told that
   * before they do -- evidence that disappears from a queue because somebody
   * cleared a neighbouring lead is evidence nobody decided to drop.
   */
  alsoNames: number;
}

interface CaseDisclosure {
  id: string;
  itemType: string;
  itemLabel: string | null;
  occurredAt: string;
}

interface CaseDeclaration {
  id: string;
  outcome: string;
  declaredAt: string;
  attestationVersion: string;
  amountRaised: number | null;
  currency: string | null;
  declaredExternal: string | null;
  declaredByName: string | null;
  /** Where this investor stands in the founder's own statement. */
  namesThisInvestor: boolean;
  undeclaredHere: boolean;
  introducedHere: boolean;
  undeclaredCount: number;
  introducedCount: number;
}

/** One dated fact. The kind is a token the UI translates; the server decides
 *  what happened and when, the client decides what to call it. */
interface TimelineEntry {
  kind: string;
  at: string;
  channel?: string;
  version?: string;
  label?: string;
  count?: number;
  signal?: string;
  severity?: string;
  reason?: string;
  outcome?: string;
}

interface CaseFile {
  key: string;
  startup: { id: string; name: string; slug: string | null };
  investor: { id: string; name: string; firm: string | null; type: string | null; slug: string | null };
  introduction: {
    firstContactAt: string;
    channel: string;
    tailEndsAt: string;
    /** withinTail(), never a second date comparison -- the bench and the
     *  cross-check must never disagree about whether a tail has run out. */
    live: boolean;
    termsVersion: string | null;
  } | null;
  acknowledgement: { acknowledgedAt: string; termsVersion: string } | null;
  nda: {
    signedAt: string | null;
    version: string | null;
    sha256: string | null;
    obligationsEndAt: string | null;
    counterparty: CounterpartySnapshot | null;
  } | null;
  disclosures: CaseDisclosure[];
  /** How many rows were seen for this pair, up to the scan cap. */
  disclosureCount: number;
  disclosuresTruncated: boolean;
  /** `atLeast` says the scan hit its cap, so the count is a floor and the
   *  first-message date is unknown rather than merely absent. `lastAt` is
   *  exact either way -- the scan is ordered newest first. */
  messages: { count: number; lastAt: string | null; atLeast: boolean };
  declarations: CaseDeclaration[];
  signals: CaseSignal[];
  /** Ordering only. See evidenceWeight(). */
  evidence: number;
  timeline: TimelineEntry[];
  lastSignalAt: string;
}

/**
 * How much record there is, which is what decides the reading order.
 *
 * This is a weight on the EVIDENCE, not a score on a person, and the
 * distinction is the whole design. It rises when the platform holds dated
 * artefacts a reviewer can actually read -- a signed NDA, a disclosure log, a
 * founder's own declaration that omits an investor we introduced -- and it
 * says nothing at all about whether anybody did anything wrong. A pair at the
 * top of this list is the pair with the most to read, not the most to answer
 * for.
 *
 * Sorting by date instead would put the newest lead first, which on this queue
 * means the thinnest one: the sweep raises a "quiet after access" signal weeks
 * before the round declaration that would either explain it or not.
 */
function evidenceWeight(input: {
  live: boolean;
  ndaSigned: boolean;
  disclosures: number;
  messages: number;
  offPlatform: boolean;
  undeclaredInDeclaration: boolean;
}): number {
  let n = 0;
  // A declaration that lists the round as closed and does not name an investor
  // we introduced is two dated records disagreeing -- the only thing on this
  // page that is evidence rather than context.
  if (input.undeclaredInDeclaration) n += 30;
  if (input.ndaSigned) n += 20;
  n += Math.min(input.disclosures, 20);
  if (input.offPlatform) n += 15;
  // Outside the tail there is nothing to claim, so the file is history.
  if (input.live) n += 10;
  n += Math.min(Math.round(input.messages / 2), 10);
  return Math.max(0, Math.min(100, n));
}

// ── GET: the open leads, each as one case file ──────────────────────────────

export async function GET(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || MAX_CASES, 1), MAX_CASES);

  const { data: signalRows, error } = await admin
    .from("trust_signals")
    .select("id, subject_type, subject_id, signal, severity, detail, created_at")
    .in("signal", LEAD_SIGNALS as unknown as string[])
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_SIGNALS);
  if (error) return NextResponse.json({ error: "Could not load the leads" }, { status: 500 });

  const signals = (signalRows ?? []) as SignalRow[];

  // Fan the signals out onto pairs, newest first, so the cap keeps the most
  // recently raised leads rather than an arbitrary slice.
  const byPair = new Map<string, { startupId: string; investorId: string; signals: SignalRow[] }>();
  let unpaired = 0;
  for (const row of signals) {
    const pairs = pairsFrom(row);
    if (!pairs.length) { unpaired++; continue; }
    for (const p of pairs) {
      const key = pairKey(p.startupId, p.investorId);
      const entry = byPair.get(key);
      if (entry) entry.signals.push(row);
      else if (byPair.size < limit) byPair.set(key, { ...p, signals: [row] });
    }
  }

  const pairs = Array.from(byPair.entries());
  if (!pairs.length) {
    await logAdminAction(admin, guard.adminId, "circumvention_list", "platform", null, {
      cases: 0, signals: signals.length, unpaired,
    });
    return NextResponse.json({
      cases: [],
      terms: { version: CIRCUMVENTION_TERMS_VERSION, months: NON_CIRCUMVENTION_MONTHS },
    });
  }

  const startupIds = Array.from(new Set(pairs.map(([, p]) => p.startupId)));
  const investorIds = Array.from(new Set(pairs.map(([, p]) => p.investorId)));

  // Everything in one pass. The per-pair contracts (introductionFor,
  // ndaRecordFor) are the right shape for a single deal screen and the wrong
  // shape for a listing of forty: this reads the same rows in one query each
  // and defers to withinTail() for liveness, so nothing can drift.
  //
  // Named columns only. Migration 109 revoked the financial columns of
  // `startups` from client keys, and a select star here would drag them
  // through an admin route with no business holding them.
  const [
    { data: startups },
    { data: investors },
    { data: intros },
    { data: acks },
    { data: ndas },
    { data: disclosures },
    { data: threads },
    { data: closures },
  ] = await Promise.all([
    admin.from("startups").select("id, name, slug").in("id", startupIds),
    admin.from("investors").select("id, slug, display_name, firm_name, type").in("id", investorIds),
    admin
      .from("introductions")
      .select("startup_id, investor_id, first_contact_at, channel, tail_ends_at, terms_version")
      .in("startup_id", startupIds)
      .in("investor_id", investorIds),
    admin
      .from("circumvention_acks")
      .select("startup_id, investor_id, acknowledged_at, terms_version")
      .in("startup_id", startupIds)
      .in("investor_id", investorIds),
    admin
      .from("nda_records")
      .select("startup_id, investor_id, signed_at, nda_version, text_sha256, obligations_end_at, counterparty")
      .in("startup_id", startupIds)
      .in("investor_id", investorIds),
    admin
      .from("nda_disclosures")
      .select("id, startup_id, investor_id, item_type, item_label, occurred_at")
      .in("startup_id", startupIds)
      .in("investor_id", investorIds)
      .order("occurred_at", { ascending: false })
      .limit(DISCLOSURE_SCAN_CAP),
    admin.from("threads").select("id, startup_id, investor_id").in("startup_id", startupIds).in("investor_id", investorIds),
    admin
      .from("round_closures")
      .select("id, startup_id, declared_by, outcome, declared_investor_ids, declared_external, amount_raised, currency, introduced_in_tail, undeclared_introduced, attestation_version, declared_at")
      .in("startup_id", startupIds)
      .order("declared_at", { ascending: false })
      .limit(200),
  ]);

  // Message volume, per pair. Bodies are never read here: what a leak review
  // needs is that they talked and when they last did, and the conversation
  // itself belongs to the two people having it.
  const threadPair = new Map<string, string>();
  for (const t of threads ?? []) {
    if (t.startup_id && t.investor_id) threadPair.set(t.id, pairKey(t.startup_id, t.investor_id));
  }
  const messageStats = new Map<string, { count: number; first: string | null; last: string | null }>();
  const threadIds = Array.from(threadPair.keys());
  let messagesTruncated = false;
  if (threadIds.length) {
    // Newest first, and the ordering is load-bearing rather than tidiness.
    // An unordered scan that hits the cap keeps an arbitrary slice of the
    // conversation, which would put a date on this page that is not the date
    // anything happened. Descending, the cap can only ever drop the OLDEST
    // rows, so "when they last spoke" stays exact at any volume -- and what
    // becomes unknown under truncation is known to be unknown.
    const { data: msgs } = await admin
      .from("messages")
      .select("thread_id, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_SCAN_CAP);
    messagesTruncated = (msgs ?? []).length >= MESSAGE_SCAN_CAP;
    for (const m of msgs ?? []) {
      const key = threadPair.get(m.thread_id);
      if (!key) continue;
      const stat = messageStats.get(key) ?? { count: 0, first: null, last: null };
      stat.count++;
      if (!stat.first || m.created_at < stat.first) stat.first = m.created_at;
      if (!stat.last || m.created_at > stat.last) stat.last = m.created_at;
      messageStats.set(key, stat);
    }
  }

  // The declarers, by name only. An email address here would be a second copy
  // of a founder's contact details in a queue read by a different set of
  // people, for no gain a reviewer could name.
  const declarerIds = Array.from(new Set((closures ?? []).map((c) => c.declared_by).filter(isUuid)));
  const { data: declarers } = declarerIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", declarerIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> };
  const declarerName = new Map((declarers ?? []).map((p) => [p.id, p.full_name]));

  const startupById = new Map((startups ?? []).map((s) => [s.id, s]));
  const investorById = new Map((investors ?? []).map((i) => [i.id, i]));

  const introByPair = new Map((intros ?? []).map((i) => [pairKey(i.startup_id, i.investor_id), i]));
  const ackByPair = new Map((acks ?? []).map((a) => [pairKey(a.startup_id, a.investor_id), a]));

  // Signed beats unsigned when a pair somehow has more than one record: the
  // question is whether they signed, and one signature is a yes.
  interface NdaRow {
    startup_id: string;
    investor_id: string;
    signed_at: string | null;
    nda_version: string | null;
    text_sha256: string | null;
    obligations_end_at: string | null;
    counterparty: unknown;
  }
  const ndaByPair = new Map<string, NdaRow>();
  for (const n of (ndas ?? []) as NdaRow[]) {
    const key = pairKey(n.startup_id, n.investor_id);
    const prior = ndaByPair.get(key);
    if (!prior || (!prior.signed_at && n.signed_at)) ndaByPair.set(key, n);
  }

  const disclosuresByPair = new Map<string, CaseDisclosure[]>();
  for (const d of disclosures ?? []) {
    const key = pairKey(d.startup_id, d.investor_id);
    const list = disclosuresByPair.get(key) ?? [];
    list.push({ id: d.id, itemType: d.item_type, itemLabel: d.item_label, occurredAt: d.occurred_at });
    disclosuresByPair.set(key, list);
  }

  interface ClosureRow {
    id: string;
    startup_id: string;
    declared_by: string;
    outcome: string;
    declared_investor_ids: string[] | null;
    declared_external: string | null;
    amount_raised: number | null;
    currency: string | null;
    introduced_in_tail: string[] | null;
    undeclared_introduced: string[] | null;
    attestation_version: string;
    declared_at: string;
  }
  const closuresByStartup = new Map<string, ClosureRow[]>();
  for (const c of (closures ?? []) as ClosureRow[]) {
    const list = closuresByStartup.get(c.startup_id) ?? [];
    list.push(c);
    closuresByStartup.set(c.startup_id, list);
  }

  const scanTruncated = (disclosures ?? []).length >= DISCLOSURE_SCAN_CAP;

  const cases: CaseFile[] = [];
  for (const [key, pair] of pairs) {
    const startup = startupById.get(pair.startupId);
    const investor = investorById.get(pair.investorId);
    // A signal pointing at a deleted listing has nothing left to review.
    if (!startup || !investor) continue;

    const intro = introByPair.get(key) ?? null;
    const ack = ackByPair.get(key) ?? null;
    const nda = ndaByPair.get(key) ?? null;
    const log = disclosuresByPair.get(key) ?? [];
    const stat = messageStats.get(key) ?? { count: 0, first: null, last: null };

    const declarations: CaseDeclaration[] = (closuresByStartup.get(pair.startupId) ?? [])
      .slice(0, DECLARATIONS_SHOWN)
      .map((c) => ({
        id: c.id,
        outcome: c.outcome,
        declaredAt: c.declared_at,
        attestationVersion: c.attestation_version,
        amountRaised: c.amount_raised,
        currency: c.currency,
        declaredExternal: c.declared_external,
        declaredByName: declarerName.get(c.declared_by) ?? null,
        namesThisInvestor: (c.declared_investor_ids ?? []).includes(pair.investorId),
        undeclaredHere: (c.undeclared_introduced ?? []).includes(pair.investorId),
        introducedHere: (c.introduced_in_tail ?? []).includes(pair.investorId),
        undeclaredCount: (c.undeclared_introduced ?? []).length,
        introducedCount: (c.introduced_in_tail ?? []).length,
      }));

    const caseSignals: CaseSignal[] = pair.signals.map((s) => {
      const d = detailOf(s);
      const findings = Array.isArray(d.findings) ? d.findings : [];
      const kinds = findings
        .map((f) => (f && typeof f === "object" ? (f as Detail).kind : null))
        .filter((k): k is string => typeof k === "string");
      const declaredKinds = Array.isArray(d.kinds)
        ? d.kinds.filter((k): k is string => typeof k === "string")
        : [];
      return {
        id: s.id,
        signal: s.signal,
        severity: typeof s.severity === "string" ? s.severity : "info",
        reason: typeof d.reason === "string" ? d.reason : null,
        subjectType: s.subject_type,
        createdAt: s.created_at,
        contactKinds: Array.from(new Set([...kinds, ...declaredKinds])).slice(0, 4),
        alsoNames: Math.max(0, pairsFrom(s).length - 1),
      };
    });

    const live = withinTail(intro);
    const offPlatform = caseSignals.some((s) => s.signal === "offplatform_contact");
    const undeclaredInDeclaration = declarations.some((d) => d.undeclaredHere);

    // ── The ledger ─────────────────────────────────────────────────────────
    // Dated facts only, in the order they happened. Nothing here is a
    // characterisation: every line is a row that exists somewhere else.
    const timeline: TimelineEntry[] = [];
    if (intro) timeline.push({ kind: "introduced", at: intro.first_contact_at, channel: intro.channel, version: intro.terms_version ?? undefined });
    if (ack) timeline.push({ kind: "acknowledged", at: ack.acknowledged_at, version: ack.terms_version });
    if (nda?.signed_at) timeline.push({ kind: "ndaSigned", at: nda.signed_at, version: nda.nda_version ?? undefined });
    // Only when the scan actually reached the start of the conversation. Under
    // truncation the oldest row we hold is not the first message they sent, and
    // a ledger that quietly dates the wrong event is worse than one that omits
    // it: the reviewer can chase a gap, but has no reason to doubt a date.
    if (stat.first && !messagesTruncated) timeline.push({ kind: "firstMessage", at: stat.first });
    if (log.length) {
      const oldest = log[log.length - 1];
      const newest = log[0];
      timeline.push({ kind: "firstDisclosure", at: oldest.occurredAt, label: oldest.itemType });
      if (log.length > 1) timeline.push({ kind: "lastDisclosure", at: newest.occurredAt, count: log.length });
    }
    if (stat.last && stat.last !== stat.first) timeline.push({ kind: "lastMessage", at: stat.last, count: stat.count });
    for (const s of caseSignals) {
      timeline.push({ kind: "signal", at: s.createdAt, signal: s.signal, severity: s.severity, reason: s.reason ?? undefined });
    }
    for (const d of declarations) {
      timeline.push({ kind: "declaration", at: d.declaredAt, outcome: d.outcome });
    }
    if (intro) timeline.push({ kind: live ? "tailEnds" : "tailEnded", at: intro.tail_ends_at });
    timeline.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

    cases.push({
      key,
      startup: { id: startup.id, name: startup.name ?? "", slug: startup.slug ?? null },
      investor: {
        id: investor.id,
        name: investor.display_name?.trim() || investor.firm_name?.trim() || "",
        // Never repeat the name in the second slot: "Acme · Acme" reads as a bug.
        firm: investor.firm_name?.trim() && investor.firm_name.trim() !== investor.display_name?.trim()
          ? investor.firm_name.trim()
          : null,
        type: investor.type ?? null,
        slug: investor.slug ?? null,
      },
      introduction: intro
        ? {
            firstContactAt: intro.first_contact_at,
            channel: intro.channel,
            tailEndsAt: intro.tail_ends_at,
            live,
            termsVersion: intro.terms_version ?? null,
          }
        : null,
      acknowledgement: ack ? { acknowledgedAt: ack.acknowledged_at, termsVersion: ack.terms_version } : null,
      nda: nda
        ? {
            signedAt: nda.signed_at,
            version: nda.nda_version,
            sha256: nda.text_sha256,
            obligationsEndAt: nda.obligations_end_at,
            counterparty: (nda.counterparty as CounterpartySnapshot | null) ?? null,
          }
        : null,
      disclosures: log.slice(0, DISCLOSURES_SHOWN),
      disclosureCount: log.length,
      disclosuresTruncated: scanTruncated,
      messages: { count: stat.count, lastAt: stat.last, atLeast: messagesTruncated },
      declarations,
      signals: caseSignals,
      evidence: evidenceWeight({
        live,
        ndaSigned: !!nda?.signed_at,
        disclosures: log.length,
        messages: stat.count,
        offPlatform,
        undeclaredInDeclaration,
      }),
      timeline: timeline.slice(0, TIMELINE_MAX),
      lastSignalAt: caseSignals.reduce((max, s) => (s.createdAt > max ? s.createdAt : max), caseSignals[0]?.createdAt ?? ""),
    });
  }

  // Strength of record first; the newest lead breaks a tie, so two equally
  // thin files still come back in a stable order.
  cases.sort((a, b) => (b.evidence - a.evidence) || (a.lastSignalAt < b.lastSignalAt ? 1 : -1));

  // Reading a pair's disclosure history is itself an act worth recording: this
  // is the log an auditor reads to answer "who looked into whom".
  await logAdminAction(admin, guard.adminId, "circumvention_list", "platform", null, {
    cases: cases.length,
    signals: signals.length,
    unpaired,
    pairs: cases.map((c) => ({ startup_id: c.startup.id, investor_id: c.investor.id })),
  });

  return NextResponse.json({
    cases,
    terms: { version: CIRCUMVENTION_TERMS_VERSION, months: NON_CIRCUMVENTION_MONTHS },
  });
}

// ── POST: mark one lead reviewed ────────────────────────────────────────────

/**
 * The only write on this surface, and deliberately the smallest one that
 * closes a lead honestly: a note saying what the reviewer concluded, and the
 * signals underneath the lead marked resolved so the queue stops re-showing a
 * file somebody has already read.
 *
 * It bills nobody and suspends nobody. Both of those are real decisions with
 * real consequences for somebody's money, and they belong to the surfaces that
 * already own them (the fee ledger, the suspension route), taken deliberately
 * and separately -- never as a side effect of clearing a queue.
 *
 * The signals to resolve are re-derived from the pair rather than accepted
 * from the client. A caller that could post a list of signal ids could post
 * any signal id on the platform, and "close the lead I am looking at" must not
 * be a way to silently clear somebody else's queue.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const body = await req.json().catch(() => ({}));
  const startupId = uuid(body?.startupId);
  const investorId = uuid(body?.investorId);
  if (!startupId || !investorId) {
    return NextResponse.json({ error: "startupId and investorId are required" }, { status: 400 });
  }

  // A lead closed without a reason is a lead nobody can re-open: the next
  // reviewer sees a resolved signal and no account of why it was resolved.
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";
  if (!note) return NextResponse.json({ error: "A note is required to close a lead." }, { status: 400 });

  const { data: signalRows, error } = await admin
    .from("trust_signals")
    .select("id, subject_type, subject_id, signal, severity, detail, created_at")
    .in("signal", LEAD_SIGNALS as unknown as string[])
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_SIGNALS);
  if (error) return NextResponse.json({ error: "Could not load the lead" }, { status: 500 });

  const wanted = pairKey(startupId, investorId);
  const matched = ((signalRows ?? []) as SignalRow[]).filter((row) =>
    pairsFrom(row).some((p) => pairKey(p.startupId, p.investorId) === wanted),
  );
  const ids = matched.map((row) => row.id);

  if (!ids.length) {
    return NextResponse.json({ error: "That lead is no longer open." }, { status: 404 });
  }

  // A round-level finding names every investor its cross-check turned up, so
  // closing this pair closes their leads too. The count goes into the audit
  // entry and back to the caller: the bench warns before the click, and the
  // log says afterwards exactly how many files one review actually closed.
  const affectedPairs = new Set<string>();
  for (const row of matched) {
    for (const p of pairsFrom(row)) affectedPairs.add(pairKey(p.startupId, p.investorId));
  }

  const { error: updateError } = await admin
    .from("trust_signals")
    .update({ resolved_at: new Date().toISOString(), resolved_by: guard.adminId })
    .in("id", ids)
    .is("resolved_at", null);
  if (updateError) return NextResponse.json({ error: "Could not close the lead" }, { status: 500 });

  // The note goes on BOTH files. A lead is about a pair, and an operator who
  // opens the investor next month should not have to know that the conclusion
  // happens to have been filed under the startup.
  await admin
    .from("admin_notes")
    .insert([
      { target_type: "startup", target_id: startupId, body: note, admin_id: guard.adminId },
      { target_type: "investor", target_id: investorId, body: note, admin_id: guard.adminId },
    ])
    .then(undefined, () => {});

  await logAdminAction(admin, guard.adminId, "circumvention_reviewed", "startup", startupId, {
    investor_id: investorId,
    signals_resolved: ids,
    pairs_closed: Array.from(affectedPairs),
    note,
  });

  return NextResponse.json({
    success: true,
    resolved: ids.length,
    pairsClosed: affectedPairs.size,
  });
}
