import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { isUuid } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Reading a member's correspondence.
 *
 * The circumvention queue can say that two people exchanged forty messages and
 * nothing else, so every question that decides a case -- what was said, who
 * said it, what the platform withheld on the way through -- ended at a count.
 * This route answers those and nothing else: it lists one member's threads, and
 * it returns one thread's messages.
 *
 * There is no POST, PATCH or DELETE in this file and there must not be. An
 * admin may read this correspondence; they may not join it, edit it or erase
 * it. Next answers an unexported method with 405, so a surface that exports
 * only GET cannot be talked into a write by a client that asks nicely.
 *
 * Three properties hold it up.
 *
 * SERVICE ROLE, because `messages` and `threads` are RLS-scoped to the parties
 * and an admin is party to nothing. There are no admin policies on this schema,
 * so an admin reading through their own session would see an empty platform.
 *
 * THE LOG COMES FIRST. Every response carrying content is preceded by an
 * awaited, error-checked admin_actions insert naming the member and, where one
 * was asked for, the thread. If that insert fails the request fails, and no
 * message body is fetched before it succeeds.
 *
 * WITHHELD TEXT IS LABELLED AS WITHHELD. Where masking rewrote a message, the
 * delivered body and the original come back as two separate fields, never
 * merged. Showing the raw text in the delivered slot would show an admin a
 * message that was never sent, and showing only the delivered text would hide
 * the attempt that makes the thread worth reading in the first place.
 *
 * LEVEL: operator, deliberately, and the reasoning is not "somewhere in the
 * middle". `support` is what an admin row with no level recorded resolves to,
 * and is defined as reading the platform and leaving notes -- the platform's
 * record of itself, which two members' private messages are not. `owner` is
 * defined as the irreversible and the platform-wide; a read is neither, and
 * gating evidence there would leave the operators who actually suspend
 * accounts asking an owner to paste screenshots at them, which is the same
 * disclosure with none of the audit trail. `operator` is also what
 * /api/admin/circumvention already requires, and this is the queue that sends
 * a reviewer here.
 */

/** Threads listed for one member. A reviewer works a screen at a time. */
const THREADS_SHOWN = 100;
/**
 * Rows scanned for the per-thread counts. Newest first, so a member past the
 * cap loses their OLDEST rows: "when they last spoke" stays exact at any
 * volume, and the counts under it are reported as truncated rather than wrong.
 */
const MESSAGE_SCAN_CAP = 5000;
/** One page of a conversation. A 4000-message thread pages; it never arrives. */
const PAGE_DEFAULT = 100;
const PAGE_MAX = 200;

type PartyKind = "startup" | "investor";

interface Party {
  kind: PartyKind;
  id: string;
  label: string;
  slug: string | null;
  /** Whose messages count as this side's. Null for an off-platform investor. */
  ownerId: string | null;
}

interface PartyRef { kind: PartyKind; id: string }

type Db = SupabaseClient;

// ── Labels ──────────────────────────────────────────────────────────────────

function fromSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function investorLabel(row: { display_name?: string | null; firm_name?: string | null; slug?: string | null }): string {
  return row.display_name || row.firm_name || fromSlug(row.slug) || "Investor";
}

function startupLabel(row: { name?: string | null; slug?: string | null }): string {
  return row.name || fromSlug(row.slug) || "Company";
}

// ── The thread's two sides ──────────────────────────────────────────────────

/**
 * Who is in a thread, read from all four participant columns at once.
 *
 * The columns do not mean initiator and recipient in any consistent way: a
 * classic pair sets startup_id AND investor_id with no recipient at all, while
 * a same-kind thread sets the id/recipient_id pair of that one kind. Reading
 * them as a fixed pair of roles gets one of the three shapes wrong, so they are
 * read as a set of parties and deduped.
 */
function partyRefs(thread: {
  startup_id: string | null;
  investor_id: string | null;
  recipient_startup_id: string | null;
  recipient_investor_id: string | null;
}): PartyRef[] {
  const out: PartyRef[] = [];
  const seen = new Set<string>();
  const add = (kind: PartyKind, id: string | null) => {
    if (!id) return;
    const key = `${kind}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, id });
  };
  add("startup", thread.startup_id);
  add("investor", thread.investor_id);
  add("startup", thread.recipient_startup_id);
  add("investor", thread.recipient_investor_id);
  return out;
}

/** Labels and owners for a batch of party references, two queries whatever
 *  the batch size. */
async function loadParties(admin: Db, refs: PartyRef[]): Promise<Map<string, Party>> {
  const startupIds = Array.from(new Set(refs.filter((r) => r.kind === "startup").map((r) => r.id)));
  const investorIds = Array.from(new Set(refs.filter((r) => r.kind === "investor").map((r) => r.id)));

  const [{ data: startups }, { data: investors }] = await Promise.all([
    startupIds.length
      ? admin.from("startups").select("id, name, slug, owner_id").in("id", startupIds)
      : Promise.resolve({ data: [] as any[] }),
    investorIds.length
      ? admin.from("investors").select("id, display_name, firm_name, slug, owner_id").in("id", investorIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const map = new Map<string, Party>();
  for (const s of startups ?? []) {
    map.set(`startup:${s.id}`, { kind: "startup", id: s.id, label: startupLabel(s), slug: s.slug ?? null, ownerId: s.owner_id ?? null });
  }
  for (const i of investors ?? []) {
    map.set(`investor:${i.id}`, { kind: "investor", id: i.id, label: investorLabel(i), slug: i.slug ?? null, ownerId: i.owner_id ?? null });
  }
  return map;
}

// ── safety_flags ────────────────────────────────────────────────────────────

interface Flags {
  masked: string[];
  scam: string[];
  scamSeverity: string | null;
}

/** jsonb written by four call sites, so it is read defensively rather than
 *  cast. A malformed blob costs a flag, never the message. */
function readFlags(value: unknown): Flags {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    masked: list(raw.masked),
    scam: list(raw.scam),
    scamSeverity: typeof raw.scamSeverity === "string" ? raw.scamSeverity : null,
  };
}

/**
 * What was delivered, and what was taken out of it.
 *
 * body_original is written ONLY when masking changed the text, so its presence
 * is the diff and there is nothing to compare against when it is absent. The
 * equality check is for rows that predate that rule and stored an identical
 * copy: an admin told text was withheld, shown the same sentence twice, learns
 * to ignore the label.
 *
 * The two never merge. `body` is what the counterparty received and `withheld`
 * is what they did not, and which of the two an admin is looking at has to be
 * visible in the payload, not decided by it.
 */
function disclose(row: { body: string | null; body_original: string | null; safety_flags: unknown }) {
  const flags = readFlags(row.safety_flags);
  const original = row.body_original;
  const bodyOriginal = original && original !== row.body ? original : null;
  return {
    body: row.body ?? "",
    bodyOriginal,
    // Only meaningful alongside a withheld original; a flag with nothing behind
    // it would put "email withheld" on a message that still carries the email.
    maskedKinds: bodyOriginal ? flags.masked : [],
    scamKinds: flags.scam,
    scamSeverity: flags.scamSeverity,
  };
}

// ── The audit entry ─────────────────────────────────────────────────────────

/**
 * The read is not allowed to outrun its own record.
 *
 * logAdminAction() deliberately swallows a failed insert, which is right for a
 * log written after an action that already happened: losing the record must not
 * undo a suspension. Here the record is a precondition rather than a receipt.
 * Nothing has been disclosed yet at this point, so a failed insert can still be
 * answered with an error instead of somebody's correspondence -- which is why
 * this writes its own insert and checks the result instead of calling the
 * shared helper.
 *
 * Awaited for the reason the view-as pages document: a detached insert never
 * runs once the lambda freezes.
 */
async function auditRead(
  admin: Db,
  adminId: string,
  target: { kind: PartyKind; id: string; label: string },
  details: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { error } = await admin.from("admin_actions").insert({
      admin_id: adminId,
      action: "read_messages",
      target_type: target.kind,
      target_id: target.id,
      note: target.label,
      details,
    });
    if (error) {
      console.error("[admin/messages] audit insert failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[admin/messages] audit insert threw:", err);
    return false;
  }
}

/** Built per call, never hoisted to a module constant: a response body is a
 *  one-shot stream, and a shared instance would come back consumed for the
 *  second caller to hit this on a warm lambda. */
const auditFailed = () => NextResponse.json(
  { error: "This read could not be recorded, so it was not performed." },
  { status: 500 },
);

// ── Which member ────────────────────────────────────────────────────────────

/**
 * The member being inspected, under either spelling.
 *
 * The panel on a member's page calls them memberType/memberId and names them on
 * every request including the one that opens a thread; a caller working from a
 * thread id alone names them subjectType/subjectId or not at all. One endpoint
 * reads both, because the alternative is a second route doing this again.
 */
function subjectParam(url: URL): { kind: string | null; id: string | null } {
  return {
    kind: url.searchParams.get("subjectType") ?? url.searchParams.get("memberType"),
    id: url.searchParams.get("subjectId") ?? url.searchParams.get("memberId"),
  };
}

// ── A member's threads ──────────────────────────────────────────────────────

async function listThreads(admin: Db, adminId: string, kind: PartyKind, id: string) {
  const parties = await loadParties(admin, [{ kind, id }]);
  const subject = parties.get(`${kind}:${id}`);
  if (!subject) return NextResponse.json({ error: "No such member" }, { status: 404 });

  if (!(await auditRead(admin, adminId, subject, { mode: "threads", subject_type: kind, subject_id: id }))) {
    return auditFailed();
  }

  // PostgREST .or() takes a raw filter string, so the id goes in only after
  // isUuid() in GET has established it is a uuid and nothing else.
  const ors = kind === "startup"
    ? [`startup_id.eq.${id}`, `recipient_startup_id.eq.${id}`]
    : [`investor_id.eq.${id}`, `recipient_investor_id.eq.${id}`];

  const { data: threadRows, error } = await admin
    .from("threads")
    .select("id, status, created_at, updated_at, startup_id, investor_id, recipient_startup_id, recipient_investor_id")
    .or(ors.join(","))
    .order("updated_at", { ascending: false })
    .limit(THREADS_SHOWN);
  if (error) return NextResponse.json({ error: "Could not load these conversations" }, { status: 500 });

  const threads = threadRows ?? [];
  const refs = threads.flatMap((t: any) => partyRefs(t));
  const labels = refs.length ? await loadParties(admin, refs) : new Map<string, Party>();

  // Counts, last activity and whether anything was ever masked -- computed from
  // safety_flags, so listing a member's inbox loads no message text at all.
  // applyMessageSafety writes flags.masked and body_original together, so the
  // flag answers "was anything withheld here" without opening what was.
  const ids = threads.map((t: any) => t.id);
  const stats = new Map<string, { count: number; last: string | null; masked: number }>();
  let truncated = false;
  if (ids.length) {
    const { data: msgs } = await admin
      .from("messages")
      .select("thread_id, created_at, safety_flags")
      .in("thread_id", ids)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_SCAN_CAP);
    truncated = (msgs ?? []).length >= MESSAGE_SCAN_CAP;
    for (const m of msgs ?? []) {
      const stat = stats.get(m.thread_id) ?? { count: 0, last: null, masked: 0 };
      stat.count++;
      if (!stat.last || m.created_at > stat.last) stat.last = m.created_at;
      if (readFlags(m.safety_flags).masked.length) stat.masked++;
      stats.set(m.thread_id, stat);
    }
  }

  return NextResponse.json({
    subject: { kind: subject.kind, id: subject.id, label: subject.label, slug: subject.slug },
    threads: threads.map((t: any) => {
      const counterpart = partyRefs(t)
        .filter((r) => !(r.kind === kind && r.id === id))
        .map((r) => labels.get(`${r.kind}:${r.id}`))
        .find(Boolean) ?? null;
      const stat = stats.get(t.id);
      return {
        id: t.id,
        status: t.status,
        createdAt: t.created_at,
        counterpart: counterpart
          ? { kind: counterpart.kind, id: counterpart.id, label: counterpart.label, slug: counterpart.slug }
          : null,
        counterpartyName: counterpart?.label ?? null,
        messageCount: stat?.count ?? 0,
        // updated_at moves for reasons other than a message, so the last
        // message is read from the messages themselves.
        lastMessageAt: stat?.last ?? null,
        // How many, not just whether: one withheld attempt in a two-message
        // thread and one in four hundred are different situations, and the
        // scan has already counted them.
        maskedCount: stat?.masked ?? 0,
        everMasked: (stat?.masked ?? 0) > 0,
      };
    }),
    /** Counts are a floor rather than a total once this is true. */
    truncated,
  });
}

// ── One thread ──────────────────────────────────────────────────────────────

async function readThread(admin: Db, adminId: string, threadId: string, url: URL) {
  const { data: thread, error: threadError } = await admin
    .from("threads")
    .select("id, status, created_at, startup_id, investor_id, recipient_startup_id, recipient_investor_id")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) return NextResponse.json({ error: "Could not load this conversation" }, { status: 500 });
  if (!thread) return NextResponse.json({ error: "No such conversation" }, { status: 404 });

  const refs = partyRefs(thread);
  const labels = await loadParties(admin, refs);
  const parties = refs.map((r) => labels.get(`${r.kind}:${r.id}`)).filter((p): p is Party => !!p);

  // A thread whose parties no longer resolve cannot be logged against a member,
  // and this route does not return content it cannot attribute to one.
  if (!parties.length) return NextResponse.json({ error: "No such conversation" }, { status: 404 });

  // Whose file the admin opened, when they said. A reviewer arriving from a
  // member's page names that member; the log should say so rather than always
  // naming whichever side happens to sit in startup_id. A named member who is
  // not party to this thread is ignored rather than logged: the entry has to
  // name somebody whose correspondence this actually is.
  const asked = subjectParam(url);
  const matched = parties.find((p) => p.kind === asked.kind && p.id === asked.id);
  const target = matched ?? parties[0];
  // The entry names whoever the correspondence actually belongs to, not who
  // was claimed. But the MISMATCH is itself worth recording: an operator
  // reaching a thread by id while naming a member who is not party to it is
  // the one access pattern here that nobody would do by accident, and
  // discarding it left the only trace of it nowhere.
  const claimedMismatch = asked.id && !matched
    ? { claimed_kind: asked.kind, claimed_id: asked.id }
    : null;

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || PAGE_DEFAULT, 1), PAGE_MAX);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  if (!(await auditRead(admin, adminId, target, {
    mode: "thread",
    thread_id: threadId,
    parties: parties.map((p) => ({ kind: p.kind, id: p.id })),
    limit,
    offset,
    ...(claimedMismatch ? { claimed_not_a_party: claimedMismatch } : {}),
  }))) {
    return auditFailed();
  }

  const { data: rows, count, error } = await admin
    .from("messages")
    .select("id, sender_id, created_at, body, body_original, safety_flags, attachment_name", { count: "exact" })
    .eq("thread_id", threadId)
    // Oldest first: a conversation read backwards is a different conversation.
    // The id tiebreak keeps the order total, so paging by offset over an
    // append-only table cannot skip or repeat a message between requests.
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: "Could not load these messages" }, { status: 500 });

  const messages = rows ?? [];

  // Which side a sender was writing for. Owners first, then team members, so a
  // firm's associate is attributed to the firm rather than to nobody; a profile
  // sitting on both sides of one thread resolves to the side it owns, which is
  // the only tiebreak available.
  const sideOf = new Map<string, Party>();
  for (const p of parties) if (p.ownerId) sideOf.set(p.ownerId, p);
  const partyIds = parties.map((p) => p.id);
  if (partyIds.length) {
    const { data: team } = await admin
      .from("team_members")
      .select("entity_type, entity_id, user_id")
      .in("entity_id", partyIds);
    for (const m of team ?? []) {
      const p = parties.find((x) => x.kind === m.entity_type && x.id === m.entity_id);
      if (p && !sideOf.has(m.user_id)) sideOf.set(m.user_id, p);
    }
  }

  const senderIds = Array.from(new Set(messages.map((m: any) => m.sender_id).filter(Boolean)));
  const { data: senderRows } = senderIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", senderIds)
    : { data: [] as any[] };
  const senderName = new Map((senderRows ?? []).map((p: any) => [p.id, p.full_name as string | null]));

  const total = count ?? messages.length;

  return NextResponse.json({
    thread: {
      id: thread.id,
      status: thread.status,
      createdAt: thread.created_at,
      parties: parties.map((p) => ({ kind: p.kind, id: p.id, label: p.label, slug: p.slug })),
      subject: { kind: target.kind, id: target.id, label: target.label, slug: target.slug },
    },
    messages: messages.map((m: any) => {
      const side = sideOf.get(m.sender_id) ?? null;
      return {
        id: m.id,
        createdAt: m.created_at,
        // The entity label stands in for an unnamed profile: the side is
        // already identified, and a second copy of somebody's address does not
        // become necessary just because an admin is reading the thread.
        senderName: senderName.get(m.sender_id) || side?.label || "Unknown",
        sender: { kind: side?.kind ?? null, partyId: side?.id ?? null },
        // Which side of the transcript this sits on. A sender who is on
        // neither side any more (a departed team member) is not the member, so
        // this stays false rather than guessing.
        fromMember: !!side && side.kind === target.kind && side.id === target.id,
        // An attachment-only message has next to no body, and without this it
        // would read as somebody sending nothing.
        attachmentName: m.attachment_name ?? null,
        ...disclose(m),
      };
    }),
    page: { limit, offset, total, hasMore: offset + messages.length < total },
  });
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId");
  const subject = subjectParam(url);

  // A thread id wins: the member params travel with it so the audit entry can
  // name whose file this was opened from, and listing the inbox instead would
  // answer a question nobody asked.
  if (threadId) {
    if (!isUuid(threadId)) return NextResponse.json({ error: "threadId must be a uuid" }, { status: 400 });
    return readThread(guard.admin, guard.adminId, threadId, url);
  }

  if (subject.kind || subject.id) {
    if (subject.kind !== "startup" && subject.kind !== "investor") {
      return NextResponse.json({ error: "subjectType must be startup or investor" }, { status: 400 });
    }
    if (!isUuid(subject.id)) return NextResponse.json({ error: "subjectId must be a uuid" }, { status: 400 });
    return listThreads(guard.admin, guard.adminId, subject.kind, subject.id);
  }

  return NextResponse.json(
    { error: "Ask for a member's threads (subjectType and subjectId) or one thread (threadId)." },
    { status: 400 },
  );
}
