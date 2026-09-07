import { createAdminClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";
import { CIRCUMVENTION_TERMS_VERSION, NON_CIRCUMVENTION_MONTHS } from "@/lib/circumvention-text";

/**
 * The introduction: the fact every fee claim stands on.
 *
 * Until now the platform captured CONSENT (circumvention_acks: "I agree a fee
 * applies") but never the EVENT it attaches to. That is the wrong half. In an
 * argument about a round closed off-platform, nobody disputes that terms were
 * shown; they dispute who introduced whom and when. Without a row saying "these
 * two parties first made contact on this date, through this channel, under
 * this version of the terms", the answer has to be reconstructed from message
 * timestamps -- which is inference, not evidence.
 *
 * One row per (startup, investor) pair, enforced by a UNIQUE constraint in
 * migration 113. FIRST contact wins, always: a later channel touching the same
 * pair must never move the date forward, because moving it forward extends the
 * tail, and a tail that can be extended by the platform's own writes is not a
 * term anybody should be able to rely on -- in either direction.
 *
 * Service-role only. public.introductions has RLS enabled with no permissive
 * policy, so every function here is reachable exclusively from server code
 * that has already authenticated its caller.
 */

/** Must match the CHECK constraint on introductions.channel (migration 113). */
export type IntroductionChannel =
  | "message" | "deal" | "nda" | "interest" | "data_room" | "introduction_request";

export interface Introduction {
  id: string;
  startup_id: string;
  investor_id: string;
  first_contact_at: string;
  channel: string;
  ack_id: string | null;
  tail_ends_at: string;
  terms_version: string | null;
}

const COLUMNS = "id, startup_id, investor_id, first_contact_at, channel, ack_id, tail_ends_at, terms_version";

export interface RecordIntroductionInput {
  startupId: string;
  /** The investor ENTITY id (investors.id), not the auth user id. */
  investorId: string;
  channel: IntroductionChannel;
  /** circumvention_acks.id, when the caller has one to hand. */
  ackId?: string | null;
  /**
   * Override the moment of first contact. Only for callers recording an
   * introduction they know is older than now -- a deal closing today whose
   * pair was never recorded happened at the deal's creation, not at close.
   * Ignored when a row already exists.
   */
  firstContactAt?: string | Date | null;
}

/** The date the tail runs out, computed once and stored, never recomputed. */
export function tailEndFrom(firstContact: Date): Date {
  const d = new Date(firstContact);
  d.setMonth(d.getMonth() + NON_CIRCUMVENTION_MONTHS);
  return d;
}

/** Is this pair still inside the window a round is attributable in? */
export function withinTail(intro: Pick<Introduction, "tail_ends_at"> | null | undefined, at: Date = new Date()): boolean {
  if (!intro?.tail_ends_at) return false;
  const ends = new Date(intro.tail_ends_at);
  return !Number.isNaN(ends.getTime()) && ends.getTime() > at.getTime();
}

/** The pair's introduction, or null if they have never been introduced here. */
export async function introductionFor(startupId: string, investorId: string): Promise<Introduction | null> {
  if (!isUuid(startupId) || !isUuid(investorId)) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("introductions")
      .select(COLUMNS)
      .match({ startup_id: startupId, investor_id: investorId })
      .maybeSingle();
    return (data as Introduction | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Record first contact, idempotently.
 *
 * Never throws and never rejects the action that produced it, for the same
 * reason recordSignal does not: this is a side effect of a real event (a
 * message, an NDA, a deal), and losing the note must not fail the event. The
 * cost of a miss is one un-evidenced pair in the watch sweep, not a broken
 * message send.
 *
 * Returns the pair's introduction -- the EXISTING one when there is one, so a
 * caller can attach its id without caring whether it won the race.
 */
export async function recordIntroduction(input: RecordIntroductionInput): Promise<Introduction | null> {
  const { startupId, investorId, channel } = input;
  if (!isUuid(startupId) || !isUuid(investorId)) return null;

  const existing = await introductionFor(startupId, investorId);
  if (existing) return existing;

  const proposed = input.firstContactAt ? new Date(input.firstContactAt) : new Date();
  const firstContact = Number.isNaN(proposed.getTime()) ? new Date() : proposed;
  // A caller cannot post-date first contact into the future to shorten nothing
  // and confuse everything; the clock is the ceiling.
  const when = firstContact.getTime() > Date.now() ? new Date() : firstContact;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("introductions")
      .insert({
        startup_id: startupId,
        investor_id: investorId,
        channel,
        ack_id: input.ackId && isUuid(input.ackId) ? input.ackId : null,
        first_contact_at: when.toISOString(),
        tail_ends_at: tailEndFrom(when).toISOString(),
        // The terms as they stood at introduction. A later bump does not reach
        // back and restate what this pair agreed to.
        terms_version: CIRCUMVENTION_TERMS_VERSION,
      })
      .select(COLUMNS)
      .single();

    if (!error && data) return data as Introduction;

    // 23505: a concurrent first contact (two tabs, message + interest in the
    // same second) won the unique constraint. Theirs is the record -- read it
    // back rather than overwriting a date that is now the one of record.
    if (error?.code === "23505") return introductionFor(startupId, investorId);

    if (error) console.warn(`[introductions] insert rejected (${channel}):`, error.message);
    return null;
  } catch (err) {
    console.warn("[introductions] could not record introduction:", err);
    return null;
  }
}

// ── Off-platform contact ────────────────────────────────────────────────────

export type OffPlatformKind = "email" | "phone" | "messaging_app";
export type MessagingApp = "telegram" | "whatsapp" | "signal" | "skype";

export interface OffPlatformFinding {
  kind: OffPlatformKind;
  /** Which app, when the kind is messaging_app. */
  app?: MessagingApp;
  /**
   * Partially masked. The full text is in the message row this came from, and
   * duplicating a personal phone number into a risk queue that a different set
   * of people read is a second copy of somebody's contact details for no gain.
   */
  excerpt: string;
  confidence: "low" | "medium" | "high";
}

/**
 * A deliberately conservative scanner for contact details pushed into a
 * message, so the watch sweep can raise "offplatform_contact" for a human.
 *
 * It returns FINDINGS. It never blocks, and nothing downstream should make it
 * block: swapping an email address is how deals actually get done, and a
 * platform that refuses the message teaches both sides to move the whole
 * conversation somewhere it cannot be evidenced at all -- the exact outcome
 * non-circumvention exists to prevent.
 *
 * Conservative means the false-positive cost is treated as higher than the
 * false-negative cost, because a wrong flag lands on a real person:
 *   -- generic links are not scanned at all, so "book me at calendly.com/jane",
 *      a Zoom room, a Notion page and a Meet link produce nothing;
 *   -- a bare @handle produces nothing (mentions, prices, "@2x" assets);
 *   -- a messaging app is a finding only with a handle or its own link, so
 *      "I don't use WhatsApp" produces nothing;
 *   -- a phone number needs an international prefix or a nearby phone word, so
 *      valuations, dates, cap-table numbers and reference codes produce nothing.
 */
export function detectOffPlatformContact(text: string | null | undefined): OffPlatformFinding[] {
  if (!text || typeof text !== "string") return [];
  const body = text.slice(0, 8000);
  const findings: OffPlatformFinding[] = [];
  const seen = new Set<string>();

  // `dedupe` lets one number found twice (once by its + prefix, once by the
  // word in front of it) count once, since the two passes mask it differently.
  const push = (f: OffPlatformFinding, dedupe?: string) => {
    const key = `${f.kind}:${f.app ?? ""}:${dedupe ?? f.excerpt}`;
    if (seen.has(key) || findings.length >= 8) return;
    seen.add(key);
    findings.push(f);
  };

  // ── Email ──────────────────────────────────────────────────────────────
  // The domain alternates on a literal dot rather than nesting quantifiers:
  // this runs on message bodies from the open internet, and the "obvious"
  // hostname pattern backtracks quadratically on a long unmatchable run.
  const EMAIL = /\b([a-z0-9._%+-]{2,64})@([a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+)/gi;
  for (const m of allMatches(EMAIL, body)) {
    const local = m[1];
    const domain = m[2].toLowerCase().replace(/\.$/, "");
    const tld = domain.slice(domain.lastIndexOf(".") + 1);
    if (!/^[a-z]{2,24}$/.test(tld)) continue;
    // "logo@2x.png" is a filename, not a mailbox.
    if (FILE_EXTENSIONS.has(tld)) continue;
    // Placeholders and our own address are not somebody routing around us.
    if (PLACEHOLDER_DOMAINS.has(domain) || domain.endsWith(".example")) continue;
    if (OWN_DOMAINS.has(domain)) continue;
    push({
      kind: "email",
      excerpt: `${local.slice(0, 2)}***@${domain}`,
      confidence: "high",
    });
  }

  // ── Messaging apps ─────────────────────────────────────────────────────
  // Canonical links first: a t.me or wa.me link is unambiguous.
  for (const [app, re] of APP_LINKS) {
    for (const m of allMatches(re, body)) {
      push({ kind: "messaging_app", app, excerpt: maskTail(m[0]), confidence: "high" });
    }
  }
  // Then app name followed closely by something that looks like a handle or a
  // number. The 32-character leash is what keeps "we can move to Signal once
  // the term sheet is out" from matching an unrelated @mention two lines down.
  const APP_HANDLE = /\b(telegram|whats\s?app|signal|skype)\b[^\n]{0,32}?((?:@|live:)[a-z0-9._-]{3,32}|\+\d[\d\s().-]{6,17}\d)/gi;
  for (const m of allMatches(APP_HANDLE, body)) {
    const app = normaliseApp(m[1]);
    if (!app) continue;
    push({ kind: "messaging_app", app, excerpt: maskTail(m[2]), confidence: "high" });
  }

  // ── Phone ──────────────────────────────────────────────────────────────
  // International prefix: strong on its own.
  const INTL = /(?:^|[^\w+])(\+\d[\d\s().-]{7,17}\d)/g;
  for (const m of allMatches(INTL, body)) {
    const raw = m[1];
    if (digitCount(raw) < 8) continue;
    push({ kind: "phone", excerpt: maskPhone(raw), confidence: "high" }, phoneKey(raw));
  }
  // No prefix: only with a phone word in front of it, and never where a
  // currency symbol or a scale suffix says this is money.
  const CONTEXTUAL = /\b(call|phone|tel|telephone|mobile|cell\s?phone|text me|ring me|reach me on|my number(?: is)?)\b[^\n]{0,24}?((?:\(?\d{2,5}\)?[\s.-]?){2,5}\d{2,6})/gi;
  for (const m of allMatches(CONTEXTUAL, body)) {
    const raw = m[2];
    if (digitCount(raw) < 8) continue;
    // Grouped thousands are a quantity, not a number to ring: "12 500 000
    // cells", "2.500.000 users". No phone plan groups every part in threes
    // after the first and separates them with a space, comma or full stop.
    if (/^\d{1,3}(?:[ ,.]\d{3})+$/.test(raw.trim())) continue;
    // Look either side of the DIGITS, not of the whole match: a currency
    // symbol in front or a scale suffix behind means this is a number about
    // money, and a founder quoting a raise is not passing out a phone number.
    const numAt = (m.index ?? 0) + m[0].lastIndexOf(raw);
    if (/[$€£¥]\s*$/.test(body.slice(Math.max(0, numAt - 3), numAt))) continue;
    if (/^\s*[kmb%]/i.test(body.slice(numAt + raw.length, numAt + raw.length + 3))) continue;
    push({ kind: "phone", excerpt: maskPhone(raw), confidence: "medium" }, phoneKey(raw));
  }

  return findings;
}

/** The strongest confidence in a set, for choosing a signal's severity. */
export function offPlatformSeverity(findings: OffPlatformFinding[]): "info" | "low" | "medium" {
  if (!findings.length) return "info";
  // Never "high". A detection is a lead for a reviewer, and the ladder's rule
  // is that a machine may say "look harder", never "this person is a fraud".
  return findings.some((f) => f.confidence === "high") ? "medium" : "low";
}

const PLACEHOLDER_DOMAINS = new Set([
  "example.com", "example.org", "example.net", "domain.com", "email.com",
  "yourcompany.com", "company.com", "acme.com", "test.com", "sentry.io",
]);

const OWN_DOMAINS = new Set(["capitalreach.com", "capitalreach.io", "vaultrise.com"]);

const FILE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "pdf", "zip", "csv", "xlsx",
  "docx", "pptx", "mp4", "mov", "json", "html", "css", "js", "ts", "exe",
]);

const APP_LINKS: [MessagingApp, RegExp][] = [
  ["telegram", /\b(?:t|telegram)\.me\/[a-z0-9_+]{3,40}/gi],
  ["whatsapp", /\b(?:wa\.me\/\d{6,18}|chat\.whatsapp\.com\/[a-z0-9]{6,40}|api\.whatsapp\.com\/send[^\s]{0,60})/gi],
  ["signal",   /\bsignal\.me\/#?[a-z0-9._%+-]{4,60}/gi],
  ["skype",    /\b(?:join\.skype\.com\/[a-z0-9]{4,40}|skype:[a-z0-9._-]{3,40})/gi],
];

function normaliseApp(raw: string): MessagingApp | null {
  const v = raw.toLowerCase().replace(/\s+/g, "");
  if (v === "telegram") return "telegram";
  if (v === "whatsapp") return "whatsapp";
  if (v === "signal") return "signal";
  if (v === "skype") return "skype";
  return null;
}

/**
 * Every match, as an array. matchAll's iterator is off the table under this
 * tsconfig, and the copied regex means a module-level /g pattern cannot carry
 * lastIndex state from one message into the next.
 */
function allMatches(re: RegExp, s: string): RegExpExecArray[] {
  const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null = rx.exec(s);
  while (m !== null && out.length < 50) {
    out.push(m);
    if (m[0] === "") rx.lastIndex++;
    m = rx.exec(s);
  }
  return out;
}

/** The last eight digits: one number is one number, however it was written. */
function phoneKey(s: string): string {
  return s.replace(/\D/g, "").slice(-8);
}

function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

/** Enough to recognise the channel, not enough to be a copy of the details. */
function maskTail(s: string): string {
  const v = s.trim();
  return v.length <= 6 ? `${v.slice(0, 2)}***` : `${v.slice(0, Math.min(8, v.length - 3))}***`;
}

function maskPhone(s: string): string {
  const digits = s.replace(/[^\d+]/g, "");
  if (digits.length <= 5) return "***";
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}
