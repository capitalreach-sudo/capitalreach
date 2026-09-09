import { createAdminClient } from "@/lib/supabase-server";

/**
 * Forcing a deal onto the record.
 *
 * The closure declaration catches a founder who ends a round without
 * mentioning who took part. It cannot catch the pair who simply never
 * created a deal at all -- who met here, negotiated in messages, signed an
 * NDA, emptied the data room, and closed without a single row saying they
 * were transacting. There is nothing for a fee to attach to, and nothing for
 * a declaration to contradict.
 *
 * So past the point where a conversation is plainly a negotiation, the next
 * message requires the deal to exist. Registering is free, one click, and
 * commits nobody: it is a record that these two are talking seriously, which
 * is the thing the amount, the close handshake and the fee all hang off.
 *
 * What this deliberately does NOT do: gate a first message. A marketplace
 * where saying hello requires paperwork has no conversations to protect.
 *
 * STATUS: superseded and switched OFF (deal_registration=off).
 * lib/contact-policy.ts now requires an accepted OFFER before an investor may
 * talk to a startup at all, which solves the same problem structurally rather
 * than by interruption -- there is no conversation that is not already on the
 * record, so there is nothing to retro-fit a deal onto.
 *
 * It is off rather than deleted for two reasons. Its recovery path was broken
 * in three separate places at once (the button sent the wrong parameter, the
 * route it called created a proposal rather than a deal, and a paused or
 * closed round refused registration outright), so a gated investor was
 * permanently stuck with no way forward -- exactly the dead end this comment
 * now exists to warn about. And the detectors below (amountsMentioned,
 * amountLooksUnderstated) are still used at close and must keep working.
 *
 * Do not switch it back on without fixing that recovery path first.
 */

export interface RegistrationConfig {
  enabled: boolean;
  afterMessages: number;
  afterDataRoom: boolean;
}

const DEFAULTS: RegistrationConfig = { enabled: false, afterMessages: 12, afterDataRoom: true };

export async function getRegistrationConfig(): Promise<RegistrationConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_config")
      .select("key, value")
      .in("key", ["deal_registration", "deal_registration_after_messages", "deal_registration_after_dataroom"]);
    const map: Record<string, string> = {};
    for (const r of data ?? []) map[r.key] = r.value;
    const n = parseInt(map["deal_registration_after_messages"] ?? "", 10);
    return {
      enabled: map["deal_registration"] === "on",
      afterMessages: Number.isFinite(n) && n > 0 ? n : DEFAULTS.afterMessages,
      afterDataRoom: map["deal_registration_after_dataroom"] !== "false",
    };
  } catch {
    // Fail OPEN: a config read that fails must not stop two people talking.
    // Under-collecting a fee is recoverable; a marketplace whose messages
    // stop working is not.
    return DEFAULTS;
  }
}

export type RegistrationReason = "message_volume" | "data_room" | "nda_signed";

export interface RegistrationVerdict {
  required: boolean;
  reason?: RegistrationReason;
  /** Messages exchanged so far, for the prompt's copy. */
  messageCount?: number;
  threshold?: number;
}

/**
 * Does this pair owe a deal record before the next message?
 *
 * Returns false the moment a deal already exists in ANY state -- including
 * passed and closed. The point is that the relationship is on the record, not
 * that it is currently active; asking someone who already declined to
 * re-register would be nagging, and a closed deal has already done its job.
 */
export async function dealRegistrationRequired(opts: {
  startupId: string;
  investorId: string;
  config?: RegistrationConfig;
}): Promise<RegistrationVerdict> {
  const config = opts.config ?? (await getRegistrationConfig());
  if (!config.enabled) return { required: false };

  const admin = createAdminClient();

  // Any deal at all, in any state, discharges this.
  const { data: existing } = await admin
    .from("deals")
    .select("id")
    .match({ startup_id: opts.startupId, investor_id: opts.investorId })
    .limit(1)
    .maybeSingle();
  if (existing) return { required: false };

  // Diligence is a stronger signal than chatter: an investor who signed an
  // NDA and opened documents is not browsing.
  if (config.afterDataRoom) {
    const { data: nda } = await admin
      .from("nda_records")
      .select("id")
      .match({ startup_id: opts.startupId, investor_id: opts.investorId })
      .not("signed_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (nda) return { required: true, reason: "nda_signed" };

    const { count: disclosures } = await admin
      .from("nda_disclosures")
      .select("id", { count: "exact", head: true })
      .match({ startup_id: opts.startupId, investor_id: opts.investorId });
    if ((disclosures ?? 0) > 0) return { required: true, reason: "data_room" };
  }

  // Volume, counted across the pair's thread.
  const { data: thread } = await admin
    .from("threads")
    .select("id")
    .match({ startup_id: opts.startupId, investor_id: opts.investorId })
    .limit(1)
    .maybeSingle();
  if (!thread) return { required: false };

  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", thread.id);

  const messageCount = count ?? 0;
  if (messageCount >= config.afterMessages) {
    return { required: true, reason: "message_volume", messageCount, threshold: config.afterMessages };
  }
  return { required: false, messageCount, threshold: config.afterMessages };
}

/** The refusal body, so every caller asks for registration in the same words. */
export function registrationRequired(v: RegistrationVerdict) {
  return {
    error: "deal_registration_required",
    reason: v.reason ?? "message_volume",
    messageKey: "dealReg.blocked",
    messageCount: v.messageCount,
    threshold: v.threshold,
  };
}

// ── Amount sanity ───────────────────────────────────────────────────────────

/**
 * Currency figures written in a conversation, largest first.
 *
 * This exists for ONE purpose: when a deal closes, a reviewer can see whether
 * the confirmed amount bears any relation to the numbers the parties were
 * discussing. It is a lead for a human and nothing else -- it never blocks a
 * close, never adjusts a fee, and never reaches either party. People write
 * "we're raising 2M" about the whole round, not this cheque, so a mismatch is
 * ordinary far more often than it is evidence.
 */
export function amountsMentioned(text: string): number[] {
  if (!text) return [];
  const out: number[] = [];
  // 2M / 1.5m / 500k / 250K, optionally preceded by a currency mark.
  const re = /(?:[$€£]\s?)?(\d+(?:[.,]\d+)?)\s*([mMkK])\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseFloat(m[1].replace(",", "."));
    if (!Number.isFinite(n)) continue;
    out.push(m[2].toLowerCase() === "m" ? n * 1_000_000 : n * 1_000);
  }
  // Plain grouped figures: 1,500,000 or 250 000. Four digits minimum, so
  // years and small counts do not become money.
  const grouped = /(?:[$€£]\s?)(\d{1,3}(?:[ ,.]\d{3})+)/g;
  while ((m = grouped.exec(text))) {
    const n = parseFloat(m[1].replace(/[ ,.]/g, ""));
    if (Number.isFinite(n) && n >= 1000) out.push(n);
  }
  return out.sort((a, b) => b - a);
}

/**
 * Is a confirmed close amount conspicuously smaller than what the pair was
 * discussing, or than the round the founder advertised?
 *
 * Returns the reason for a reviewer, or null. The ratio is deliberately
 * generous: an investor taking a 200k slice of a 2M round is the normal case,
 * so only an order of magnitude below BOTH references is worth a human's
 * attention, and even then it is a question rather than a finding.
 */
export function amountLooksUnderstated(opts: {
  closedAmount: number | null;
  fundingTarget: number | null;
  largestMentioned: number | null;
}): { understated: true; detail: Record<string, unknown> } | null {
  const { closedAmount, fundingTarget, largestMentioned } = opts;
  if (!closedAmount || closedAmount <= 0) return null;
  if (!largestMentioned || largestMentioned <= 0) return null;

  const vsMentioned = largestMentioned / closedAmount;
  if (vsMentioned < 10) return null;

  // The round's own size is the second opinion: a small cheque into a large
  // round is not suspicious, so a close near the advertised target clears it.
  if (fundingTarget && closedAmount >= fundingTarget * 0.1) return null;

  return {
    understated: true,
    detail: { closedAmount, largestMentioned, fundingTarget, ratio: Math.round(vsMentioned) },
  };
}
