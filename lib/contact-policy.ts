import { createAdminClient } from "@/lib/supabase-server";

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
 */

export type ContactVerdict =
  | { allowed: true; reason: "policy_off" | "founder_side" | "offer_accepted" | "deal_exists" | "admin" }
  | { allowed: false; reason: "needs_accepted_offer"; openProposalId: string | null; openStatus: string | null };

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
  if (!(await offerBeforeContactEnabled())) return { allowed: true, reason: "policy_off" };

  const admin = createAdminClient();

  const { data: deal } = await admin
    .from("deals").select("id")
    .match({ startup_id: opts.startupId, investor_id: opts.investorId })
    .limit(1).maybeSingle();
  if (deal) return { allowed: true, reason: "deal_exists" };

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
  return {
    error: "offer_required",
    messageKey: v.openProposalId ? "offer.awaitingReply" : "offer.required",
    openProposalId: v.openProposalId,
    openStatus: v.openStatus,
  };
}
