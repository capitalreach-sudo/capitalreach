import { createAdminClient } from "@/lib/supabase-server";
import { sealState } from "@/lib/deal-seal";

/**
 * Contact costs an accepted offer.
 *
 * The old order was backwards: an investor could talk to a founder for weeks
 * and only later, maybe, record a deal. The conversation is the valuable
 * thing the platform provides, so the conversation is what the record should
 * buy -- not the other way round.
 *
 * From here an investor opens with an OFFER, the founder accepts, declines or
 * counters, and only an accepted offer opens a thread. Circumvention stops
 * being something to detect afterwards, because there is no conversation that
 * is not already on the record. It also fixes the founder's inbox: every
 * approach now arrives with a number attached instead of "love what you're
 * building, quick call?".
 *
 * The founder side is never gated. They may always answer, and they may
 * always open a conversation with an investor themselves -- the fee is
 * theirs to pay, and a founder chasing capital is the behaviour the platform
 * exists to encourage.
 *
 * SEAL BEFORE CONTACT goes one step further, and is the rule as it now
 * stands: an accepted offer creates the deal, but a deal is DRAFT until both
 * parties countersign it (120). Free-form messaging, and the unmasking of
 * contact details that comes with it, waits for that second signature.
 *
 * The obvious objection is that people cannot negotiate without talking. They
 * are not silent in the meantime: offers and counters carry amount, equity,
 * valuation, instrument and conditions; listing questions and document
 * requests both work and are both masked. What waits for the seal is the
 * unstructured channel -- the one with no record of what was agreed, and the
 * only one through which two people can quietly arrange to finish elsewhere.
 */

export type ContactVerdict =
  | { allowed: true; reason: "policy_off" | "founder_side" | "offer_accepted" | "deal_exists" | "admin" | "deal_sealed" }
  | { allowed: false; reason: "needs_accepted_offer"; openProposalId: string | null; openStatus: string | null }
  | { allowed: false; reason: "needs_seal"; dealId: string; awaiting: Array<"startup" | "investor"> };

/**
 * Two switches, read together, so the rule can be tightened in one step and
 * loosened in one step without a deploy.
 */
export async function contactPolicyConfig(): Promise<{ offerRequired: boolean; sealRequired: boolean }> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_config").select("key, value").in("key", ["offer_before_contact", "seal_before_contact"]);
    const map: Record<string, string> = {};
    for (const r of data ?? []) map[r.key] = r.value;
    return {
      offerRequired: map["offer_before_contact"] === "on",
      sealRequired: map["seal_before_contact"] === "on",
    };
  } catch {
    // Fail OPEN, both of them. See the note below.
    return { offerRequired: false, sealRequired: false };
  }
}

export async function offerBeforeContactEnabled(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_config").select("value").eq("key", "offer_before_contact").maybeSingle();
    return data?.value === "on";
  } catch {
    // Fail OPEN. Silently closing every conversation on the platform because
    // one config row was unreadable is a far worse outcome than a few
    // ungated messages.
    return false;
  }
}

/**
 * May this investor talk to this startup yet?
 *
 * An existing deal in any state counts: the pair is already on the record,
 * which is the whole point of the rule, and re-gating an active deal because
 * its originating proposal was archived would be nonsense.
 */
export async function mayInvestorContact(opts: {
  startupId: string;
  investorId: string;
}): Promise<ContactVerdict> {
  const config = await contactPolicyConfig();
  if (!config.offerRequired && !config.sealRequired) return { allowed: true, reason: "policy_off" };

  const admin = createAdminClient();

  const { data: deal } = await admin
    .from("deals").select("id")
    .match({ startup_id: opts.startupId, investor_id: opts.investorId })
    .limit(1).maybeSingle();
  if (deal) {
    if (!config.sealRequired) return { allowed: true, reason: "deal_exists" };
    // A deal exists, so the offer half of the rule is satisfied. What is left
    // is whether both parties have signed it.
    const seal = await sealState(deal.id);
    if (seal.sealed) return { allowed: true, reason: "deal_sealed" };
    return { allowed: false, reason: "needs_seal", dealId: deal.id, awaiting: seal.awaiting };
  }

  // An accepted offer with no deal row should not happen -- acceptance creates
  // the deal in the same request -- but if the insert ever failed, the pair
  // are stuck with a yes and nothing to sign. Let them through on the
  // acceptance rather than stranding them on a deal that does not exist.
  const { data: accepted } = await admin
    .from("deal_proposals").select("id")
    .match({ startup_id: opts.startupId, investor_id: opts.investorId, status: "accepted" })
    .limit(1).maybeSingle();
  if (accepted) return { allowed: true, reason: "offer_accepted" };

  // Nothing open either -- tell the caller which, so the UI can say "your
  // offer is waiting" rather than repeating "make an offer" at somebody who
  // already has.
  const { data: pending } = await admin
    .from("deal_proposals").select("id, status")
    .match({ startup_id: opts.startupId, investor_id: opts.investorId })
    .in("status", ["pending", "countered"])
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();

  return {
    allowed: false,
    reason: "needs_accepted_offer",
    openProposalId: pending?.id ?? null,
    openStatus: pending?.status ?? null,
  };
}

/** The refusal body, so every entry point says the same thing. */
export function contactRefusal(v: Extract<ContactVerdict, { allowed: false }>) {
  if (v.reason === "needs_seal") {
    return {
      error: "seal_required",
      // Whose turn it is decides the words: "sign it" to the party who owes a
      // signature, "waiting for them" to the one who has already signed.
      messageKey: "seal.required",
      dealId: v.dealId,
      awaiting: v.awaiting,
    };
  }
  return {
    error: "offer_required",
    messageKey: v.openProposalId ? "offer.awaitingReply" : "offer.required",
    openProposalId: v.openProposalId,
    openStatus: v.openStatus,
  };
}

/**
 * May these two exchange contact details yet?
 *
 * The same question as messaging, and deliberately the same answer: the point
 * of the seal is that the obligation is captured before the relationship
 * becomes theirs to run. Once it is signed we stop rewriting their sentences.
 */
export async function contactsUnlocked(opts: {
  startupId: string;
  investorId: string;
}): Promise<boolean> {
  try {
    const config = await contactPolicyConfig();
    const admin = createAdminClient();
    const { data: deal } = await admin
      .from("deals").select("id")
      .match({ startup_id: opts.startupId, investor_id: opts.investorId })
      .limit(1).maybeSingle();
    if (!deal) return false;
    if (!config.sealRequired) return true;
    return (await sealState(deal.id)).sealed;
  } catch {
    // Fail CLOSED here, unlike the messaging gate. The cost of being wrong is
    // asymmetric: withholding a phone number for one message is a small
    // annoyance, publishing one is permanent.
    return false;
  }
}
