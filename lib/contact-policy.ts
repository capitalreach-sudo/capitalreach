import { createAdminClient } from "@/lib/supabase-server";
import { sealState } from "@/lib/deal-seal";

/**
 * Messaging costs a sealed deal.
 *
 * An investor opens with an OFFER, the founder accepts, declines or counters,
 * and acceptance creates a DEAL. The deal is a draft until both parties
 * countersign it (120). Free-form messaging between the pair opens on that
 * second signature and on nothing else: not an accepted offer, not a deal row,
 * not a thread that already exists, and not a platform_config switch.
 *
 * That last point is an invariant of this code, not a setting. The switches
 * (offer_before_contact, seal_before_contact) still exist for the surfaces
 * that read them, masking included, but mayPairContact never consults them,
 * and a record it cannot read answers with a refusal. A gate whose disabled or
 * broken state means "everyone may talk" is not a gate.
 *
 * The rule is asked of the PAIR, not of a direction. A conversation has two
 * ends and only one record, so "may these two talk" cannot have two answers.
 *
 * What differs by side is the way out of a refusal, and only that. An investor
 * makes an offer. A founder cannot -- /api/deals/proposals answers "Only
 * investors make offers" -- so a founder opens a deal instead
 * (/api/deals/create) or answers the offer already sitting in their inbox.
 * contactRefusal below names whichever of those applies, because a refusal
 * that does not is a wall with no door.
 *
 * Founder to founder and investor to investor never open: two parties who
 * cannot sign a deal with each other have no seal to reach, so the message
 * routes refuse those pairings outright for everyone but admins.
 *
 * Nobody negotiates in silence meanwhile: offers and counters carry amount,
 * equity, valuation, instrument and conditions; listing questions and document
 * requests both work and are both masked. What waits for the seal is the
 * unstructured channel -- the one with no record of what was agreed, and the
 * only one through which two people can quietly arrange to finish elsewhere.
 */

/** Which end of the pair is asking. The rule is one; the way out of it is two. */
export type ContactSide = "startup" | "investor";

/**
 * "admin" is never returned from this file. Every function here answers one
 * question -- may this STARTUP and this INVESTOR talk -- and an admin is
 * neither of them, so there is nothing in the pair for the exception to hang
 * off. The bypass lives at each call site, where the viewer is known:
 * messages/send, start, reply and attach each test the sender's role before
 * consulting the gate, and so does listingState in api/deals/proposals, which
 * decides whether the control even renders. A caller that forgets the check
 * refuses an admin, which is a visible bug rather than a silent opening.
 */
export type ContactVerdict =
  | { allowed: true; reason: "deal_sealed" }
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

type Refused = Extract<ContactVerdict, { allowed: false }>;

/**
 * Two switches, read together. The messaging gate does not read them; masking
 * (contactsUnlocked) and the offer surfaces do.
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
    return false;
  }
}

/**
 * The refusal given when the record could not be read at all. It names no
 * proposal and no deal, because nothing was learned, and it still offers each
 * side its own way in.
 */
function unreadableRefusal(opts: { investorId: string; side: ContactSide }): Refused {
  return opts.side === "startup"
    ? { allowed: false, reason: "needs_deal", investorId: opts.investorId, investorSlug: null, openProposalId: null, openFromSide: null }
    : { allowed: false, reason: "needs_accepted_offer", openProposalId: null, openStatus: null };
}

/**
 * May these two talk?
 *
 * Only a sealed deal for this exact pair says yes, and sealState is the
 * authority on sealed. `side` never changes the verdict; it selects which
 * refusal the caller gets back.
 *
 * Any failure to read the record is a refusal, never an allowance.
 */
export async function mayPairContact(opts: {
  startupId: string;
  investorId: string;
  side: ContactSide;
}): Promise<ContactVerdict> {
  try {
    return await pairVerdict(opts);
  } catch {
    return unreadableRefusal(opts);
  }
}

async function pairVerdict(opts: {
  startupId: string;
  investorId: string;
  side: ContactSide;
}): Promise<ContactVerdict> {
  const admin = createAdminClient();

  // A pair can hold more than one deal row (a passed deal, then a new one).
  // The sealed one, if any, is read first so an older unsigned row cannot
  // hide it.
  const { data: deal } = await admin
    .from("deals").select("id")
    .match({ startup_id: opts.startupId, investor_id: opts.investorId })
    .order("sealed_at", { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();
  if (deal) {
    const seal = await sealState(deal.id);
    if (seal.sealed) return { allowed: true, reason: "deal_sealed" };
    return { allowed: false, reason: "needs_seal", dealId: deal.id, awaiting: seal.awaiting };
  }

  // No deal. Which proposal is open, and whose move it is, so the UI can say
  // "your offer is waiting" rather than repeating "make an offer" at somebody
  // who already has, and so a founder is sent to the offer in their inbox
  // rather than told to open a second deal beside it. An accepted proposal
  // with no deal row is not a deal and opens nothing.
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
 * The investor end of the same question. Delegates rather than repeats, so the
 * two ends of one conversation cannot drift into two different rules.
 */
export async function mayInvestorContact(opts: {
  startupId: string;
  investorId: string;
}): Promise<ContactVerdict> {
  return mayPairContact({ ...opts, side: "investor" });
}

/** The refusal body, so every entry point says the same thing. */
export function contactRefusal(v: Refused) {
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
    // `error` carries the sentence, not a code. Several callers render
    // json.error straight into a toast, so a founder who is refused would
    // otherwise read the word "deal_required" and be given nothing to do about
    // it. errorCode is what machines branch on.
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
 * The point of the seal is that the obligation is captured before the
 * relationship becomes theirs to run. Once it is signed we stop rewriting
 * their sentences.
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
    // Fail CLOSED. Withholding a phone number for one message is a small
    // annoyance; publishing one is permanent.
    return false;
  }
}
