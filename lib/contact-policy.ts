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
 * SEAL BEFORE CONTACT goes one step further, and is the rule as it now
 * stands: an accepted offer creates the deal, but a deal is DRAFT until both
 * parties countersign it (120). Free-form messaging, and the unmasking of
 * contact details that comes with it, waits for that second signature.
 *
 * The rule is asked of the PAIR, not of a direction. A conversation has two
 * ends and only one record, so "may these two talk" cannot have two answers;
 * gating only the investor left the founder able to open a thread with anyone
 * on the platform, which is the same conversation with the same fee attached.
 *
 * What differs by side is the way out of a refusal, and only that. An investor
 * makes an offer. A founder cannot -- /api/deals/proposals answers "Only
 * investors make offers" -- so a founder opens a deal instead
 * (/api/deals/create) or answers the offer already sitting in their inbox.
 * contactRefusal below names whichever of those applies, because a refusal
 * that does not is a wall with no door.
 *
 * Founder to founder is outside all of this. No capital moves between two
 * companies comparing notes, there is no deal to seal, and the live-listing
 * check on that path is the only admission it needs.
 *
 * The obvious objection is that people cannot negotiate without talking. They
 * are not silent in the meantime: offers and counters carry amount, equity,
 * valuation, instrument and conditions; listing questions and document
 * requests both work and are both masked. What waits for the seal is the
 * unstructured channel -- the one with no record of what was agreed, and the
 * only one through which two people can quietly arrange to finish elsewhere.
 */

/** Which end of the pair is asking. The rule is one; the way out of it is two. */
export type ContactSide = "startup" | "investor";

/**
 * "admin" is never returned from this file, and that is deliberate rather than
 * an omission. Every function here answers one question -- may this STARTUP and
 * this INVESTOR talk -- and an admin is neither of them, so there is nothing in
 * the pair for the exception to hang off. The bypass therefore lives at each
 * call site, where the viewer is known: messages/send, start, reply and attach
 * each test the sender's role before consulting the gate, and so does
 * listingState in api/deals/proposals, which decides whether the control even
 * renders. Adding a viewer argument here would put the answer in two places and
 * let them drift; a caller that forgets the check is a visible bug, which is
 * how the missing one in listingState was eventually found.
 */
export type ContactVerdict =
  | { allowed: true; reason: "policy_off" | "founder_side" | "offer_accepted" | "deal_exists" | "admin" | "deal_sealed" | "predates_gate" }
  | { allowed: false; reason: "needs_accepted_offer"; openProposalId: string | null; openStatus: string | null }
  | {
      allowed: false;
      reason: "needs_deal";
      investorId: string;
      /** For the link to the profile the deal is opened from; null if unslugged. */
      investorSlug: string | null;
      openProposalId: string | null;
      openFromSide: ContactSide | null;
    }
  | { allowed: false; reason: "needs_seal"; dealId: string; awaiting: Array<"startup" | "investor"> };

/**
 * The day the gate stopped being investor-only.
 *
 * A pair already talking before it keeps their thread, for the same reason
 * migration 120 backfilled every existing deal as sealed: a rule introduced
 * today is about what happens next, and retroactively closing a conversation
 * that was legitimate when it started punishes people for our change of mind.
 * A timestamp rather than mere thread existence, because any authenticated
 * client may insert a `threads` row (102), so "a thread exists" would be a
 * bypass anyone could mint on demand; a row dated before this cannot be.
 */
export const SYMMETRIC_GATE_FROM = "2026-09-10T00:00:00.000Z";

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

/** Grandfathering, kept to one query and to the founder side. See SYMMETRIC_GATE_FROM. */
async function threadPredatesGate(startupId: string, investorId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("threads").select("id")
    .match({ startup_id: startupId, investor_id: investorId })
    .lt("created_at", SYMMETRIC_GATE_FROM)
    .limit(1).maybeSingle();
  return !!data;
}

/**
 * May these two talk yet?
 *
 * One question, one answer, asked from either end. An existing deal in any
 * state counts: the pair is already on the record, which is the whole point of
 * the rule, and re-gating an active deal because its originating proposal was
 * archived would be nonsense.
 *
 * `side` never changes the verdict. It selects which refusal the caller gets
 * back, and whether the grandfather clause applies -- that clause covers the
 * half of the rule introduced today, so it is the founder's. Extending it to
 * the investor would reopen threads the seal deliberately closed.
 */
export async function mayPairContact(opts: {
  startupId: string;
  investorId: string;
  side: ContactSide;
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

  // Nothing on the record at all. Checked here rather than at the top so a
  // pair who are through the gate never pay for the query.
  if (opts.side === "startup" && await threadPredatesGate(opts.startupId, opts.investorId)) {
    return { allowed: true, reason: "predates_gate" };
  }

  // Which proposal is open, and whose move it is -- so the UI can say "your
  // offer is waiting" rather than repeating "make an offer" at somebody who
  // already has, and so a founder is sent to the offer in their inbox rather
  // than told to open a second deal beside it.
  const { data: pending } = await admin
    .from("deal_proposals").select("id, status, from_side")
    .match({ startup_id: opts.startupId, investor_id: opts.investorId })
    .in("status", ["pending", "countered"])
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();

  if (opts.side === "startup") {
    const { data: inv } = await admin
      .from("investors").select("slug").eq("id", opts.investorId).maybeSingle();
    return {
      allowed: false,
      reason: "needs_deal",
      investorId: opts.investorId,
      investorSlug: (inv?.slug as string | null) ?? null,
      openProposalId: pending?.id ?? null,
      openFromSide: (pending?.from_side as ContactSide | null) ?? null,
    };
  }

  return {
    allowed: false,
    reason: "needs_accepted_offer",
    openProposalId: pending?.id ?? null,
    openStatus: pending?.status ?? null,
  };
}

/**
 * The investor end of the same question. Kept as its own name because four
 * routes call it, and delegating rather than repeating is what stops the two
 * ends of one conversation from drifting into two different rules.
 */
export async function mayInvestorContact(opts: {
  startupId: string;
  investorId: string;
}): Promise<ContactVerdict> {
  return mayPairContact({ ...opts, side: "investor" });
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
      href: `/deals?deal=${v.dealId}`,
      ctaKey: "founderContact.dealsCta",
    };
  }
  if (v.reason === "needs_deal") {
    // `error` carries the sentence, not a code, and that is deliberate here.
    // Several callers render json.error straight into a toast, so a founder
    // who is refused would otherwise read the word "deal_required" and be
    // given nothing to do about it. errorCode is what machines branch on.
    //
    // The three cases are three different next moves, and telling somebody to
    // do a thing they have already done is worse than saying nothing.
    if (v.openProposalId && v.openFromSide === "investor") {
      return {
        error: "This investor has an offer waiting for your answer. Accept it, then both of you sign the record and the conversation opens.",
        errorCode: "deal_required",
        messageKey: "founderContact.offerWaiting",
        href: "/dashboard/startup/offers",
        ctaKey: "founderContact.offersCta",
        openProposalId: v.openProposalId,
      };
    }
    if (v.openProposalId) {
      return {
        error: "Your deal proposal is with this investor. Once they accept it and you both sign the record, you can talk here.",
        errorCode: "deal_required",
        messageKey: "founderContact.proposalPending",
        href: "/deals",
        ctaKey: "founderContact.dealsCta",
        openProposalId: v.openProposalId,
      };
    }
    return {
      error: "You can message an investor once you have a deal with them. Open one from their profile: they accept it, you both sign the record, and this conversation opens.",
      errorCode: "deal_required",
      messageKey: "founderContact.dealRequired",
      // The profile is where a founder's "Add to pipeline" lives, with this
      // investor already chosen. /deals can do it too but asks them to find
      // the same person again in a search box.
      href: v.investorSlug ? `/investors/${v.investorSlug}` : "/deals",
      ctaKey: "founderContact.openDealCta",
      investorId: v.investorId,
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
