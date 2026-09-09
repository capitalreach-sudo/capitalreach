import { createAdminClient } from "@/lib/supabase-server";

/**
 * What the chat does about the two things people actually do in it.
 *
 * CONTACT DETAILS are withheld until a deal is on the record, and freely
 * exchanged after. The point is never to keep two people apart -- a round
 * cannot close without them talking directly, and a marketplace that forbids
 * it is one they leave. The point is that the obligation is captured first.
 * After that the relationship is theirs and we stay out of it.
 *
 * SCAM PATTERNS are marked, never blocked. The advance-fee approach -- an
 * "investor" asking a founder to pay a retainer or a deposit before funds
 * release -- is the oldest fraud in venture, and blocking it would mean
 * blocking ordinary sentences about money. So the person being asked for
 * money is told what they are looking at, and decides for themselves.
 *
 * Nothing here judges anyone. It withholds a string, or it adds a note.
 */

export interface SafetyConfig {
  maskContacts: boolean;
  scamWarnings: boolean;
}

export async function getSafetyConfig(): Promise<SafetyConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_config")
      .select("key, value")
      .in("key", ["message_contact_masking", "message_scam_warnings"]);
    const map: Record<string, string> = {};
    for (const r of data ?? []) map[r.key] = r.value;
    return {
      maskContacts: map["message_contact_masking"] === "on",
      scamWarnings: map["message_scam_warnings"] === "on",
    };
  } catch {
    // Fail OPEN: a config read that fails must not silently start rewriting
    // people's messages, which is the more alarming failure of the two.
    return { maskContacts: false, scamWarnings: false };
  }
}

export type MaskedKind = "email" | "phone" | "messaging_app" | "external_link";

export interface MaskResult {
  text: string;
  masked: MaskedKind[];
}

const PLACEHOLDER = "[contact details withheld until the deal is registered]";

// Hosts that are the platform itself, or ordinary references rather than a
// route off it. A founder linking their own website or a news article is not
// circumventing anything.
const ALLOWED_HOSTS = /(?:capitalreach\.|linkedin\.com|crunchbase\.com|github\.com|techcrunch\.com|wikipedia\.org)/i;

/**
 * Withhold the strings that let two people continue elsewhere.
 *
 * Conservative by construction: it masks the value and leaves the sentence,
 * so "email me at [withheld]" still reads as a request rather than becoming
 * gibberish, and the recipient can see they were asked.
 */
export function maskContactDetails(text: string): MaskResult {
  if (!text) return { text, masked: [] };
  const masked = new Set<MaskedKind>();
  let out = text;

  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, () => { masked.add("email"); return PLACEHOLDER; });

  // Phone numbers: at least nine digits once separators are ignored, so
  // "we raised 2 000 000" and years never qualify.
  //
  // Dates and times are the trap here. "can we do 2026-09-15 14:00" carries
  // twelve digits and was being withheld as a phone number, which breaks the
  // single most common sentence these two people will ever exchange. A
  // colon, or an ISO date, means a calendar rather than a number to ring.
  out = out.replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, (m) => {
    if (m.includes(":")) return m;
    if (/\d{4}-\d{2}-\d{2}/.test(m)) return m;
    if (/\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/.test(m)) return m;
    const digits = m.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) return m;
    masked.add("phone");
    return PLACEHOLDER;
  });

  // Messaging handles, the usual route off a marketplace.
  out = out.replace(/\b(?:telegram|whatsapp|signal|skype|wechat|discord)\b[^\n]{0,24}?(?:@[\w.]{3,}|\+?\d[\d\s().-]{6,}\d|\bt\.me\/[\w.]+)/gi,
    () => { masked.add("messaging_app"); return PLACEHOLDER; });
  out = out.replace(/\bt\.me\/[\w.]+/gi, () => { masked.add("messaging_app"); return PLACEHOLDER; });

  // Links that leave the platform, minus the ordinary references above.
  out = out.replace(/https?:\/\/[^\s<>"']+/gi, (m) => {
    if (ALLOWED_HOSTS.test(m)) return m;
    masked.add("external_link");
    return PLACEHOLDER;
  });

  return { text: out, masked: Array.from(masked) };
}

// ── Scam patterns ───────────────────────────────────────────────────────────

export type ScamPattern = "advance_fee" | "payment_request" | "off_platform_payment" | "urgency";

export interface ScamFinding { pattern: ScamPattern; severity: "low" | "medium" | "high" }

/**
 * Marks the shapes an advance-fee approach takes. Matched on INTENT words
 * together, never on a single word: "fee" alone is the most ordinary term on
 * a capital marketplace, and flagging it would mark every honest sentence
 * about the 2% and teach everyone to ignore the warning.
 */
export function detectScamPatterns(text: string): ScamFinding[] {
  if (!text) return [];
  const t = text.toLowerCase();
  const out: ScamFinding[] = [];

  const asksForMoney = /\b(pay|send|transfer|wire|deposit|remit)\b/.test(t);
  const aFeeish = /\b(fee|retainer|deposit|upfront|in advance|processing|administrative|legal cost|escrow)\b/.test(t);
  const beforeFunds = /\b(before|prior to|in order to|so (?:that )?(?:we|i) can)\b[^.]{0,60}\b(release|transfer|wire|fund|disburse|proceed)\b/.test(t);

  // The classic: money must move TO the investor before money moves FROM them.
  if (asksForMoney && aFeeish) out.push({ pattern: "advance_fee", severity: "high" });
  else if (beforeFunds) out.push({ pattern: "advance_fee", severity: "medium" });

  if (/\b(iban|swift|bic|routing number|account number|bitcoin|btc|usdt|crypto wallet|wallet address)\b/.test(t)) {
    out.push({ pattern: "off_platform_payment", severity: "high" });
  }
  if (asksForMoney && /\b(today|within 24|urgent|immediately|right away|expires)\b/.test(t)) {
    out.push({ pattern: "urgency", severity: "medium" });
  }
  return out;
}

export function scamSeverity(findings: ScamFinding[]): "low" | "medium" | "high" | null {
  if (!findings.length) return null;
  if (findings.some((f) => f.severity === "high")) return "high";
  if (findings.some((f) => f.severity === "medium")) return "medium";
  return "low";
}

/** The shape stored on the message so the client can warn without guessing. */
export interface SafetyFlags {
  masked?: MaskedKind[];
  scam?: ScamPattern[];
  scamSeverity?: "low" | "medium" | "high";
}

/**
 * One call for the write path: what to store, and what to tell the sender.
 *
 * `dealRegistered` decides masking alone. Once a pair is on the record their
 * details are their business.
 */
export function applyMessageSafety(opts: {
  body: string;
  dealRegistered: boolean;
  config: SafetyConfig;
}): { body: string; bodyOriginal: string | null; flags: SafetyFlags | null; maskedAnything: boolean } {
  const { body, dealRegistered, config } = opts;
  const flags: SafetyFlags = {};

  const scam = config.scamWarnings ? detectScamPatterns(body) : [];
  if (scam.length) {
    flags.scam = scam.map((s) => s.pattern);
    flags.scamSeverity = scamSeverity(scam) ?? undefined;
  }

  if (!config.maskContacts || dealRegistered) {
    return {
      body,
      bodyOriginal: null,
      flags: Object.keys(flags).length ? flags : null,
      maskedAnything: false,
    };
  }

  const { text, masked } = maskContactDetails(body);
  if (masked.length) flags.masked = masked;

  return {
    body: text,
    // Only kept when it differs: storing an identical copy of every message
    // doubles the table for nothing.
    bodyOriginal: masked.length ? body : null,
    flags: Object.keys(flags).length ? flags : null,
    maskedAnything: masked.length > 0,
  };
}
