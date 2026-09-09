import { createAdminClient } from "@/lib/supabase-server";

/**
 * What happens when a founder does not pay the 2%.
 *
 * Until now: three reminders, then nothing, forever. A fee with no
 * consequence is a donation, and the founders who ignore it are exactly the
 * ones who will keep ignoring it.
 *
 * The ladder is deliberately slow, graduated, and completely reversible:
 *
 *   day 0    invoice raised at close
 *   day 7    reminder (already existed)
 *   day 14   the LISTING IS PAUSED -- they stop receiving new introductions
 *   day 30   the ACCOUNT IS RESTRICTED -- no new listings, no new deals
 *
 * Three principles hold it together.
 *
 * Nothing is ever destroyed or hidden from them. A founder in arrears keeps
 * their listing, their data room, their documents, their messages and every
 * deal in flight. What they lose is the ability to take MORE from a platform
 * they have not paid for -- which is the only lever that is both effective
 * and fair.
 *
 * Every step reverses the moment the invoice is paid, and pausing records the
 * founder's own previous round state so lifting it restores what they had
 * rather than guessing.
 *
 * A disputed fee never escalates. Someone who says "this is wrong" is having
 * a conversation, not defaulting, and a system that punishes a dispute
 * teaches people not to raise one.
 */

export type EnforcementStep = "none" | "reminded" | "listing_paused" | "account_restricted" | "resolved";

export interface EnforcementConfig {
  enabled: boolean;
  pauseDays: number;
  restrictDays: number;
}

const DEFAULTS: EnforcementConfig = { enabled: false, pauseDays: 14, restrictDays: 30 };

export async function getEnforcementConfig(): Promise<EnforcementConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_config").select("key, value")
      .in("key", ["fee_enforcement", "fee_pause_days", "fee_restrict_days"]);
    const m: Record<string, string> = {};
    for (const r of data ?? []) m[r.key] = r.value;
    const p = parseInt(m["fee_pause_days"] ?? "", 10);
    const s = parseInt(m["fee_restrict_days"] ?? "", 10);
    return {
      enabled: m["fee_enforcement"] === "on",
      pauseDays: Number.isFinite(p) && p > 0 ? p : DEFAULTS.pauseDays,
      restrictDays: Number.isFinite(s) && s > 0 ? s : DEFAULTS.restrictDays,
    };
  } catch {
    // Fail OFF. Pausing somebody's fundraise because a config row could not
    // be read is not a mistake you get to take back.
    return DEFAULTS;
  }
}

export interface FeeDealRow {
  id: string;
  startup_id: string;
  closed_at: string | null;
  success_fee_amount: number | null;
  success_fee_invoiced: boolean | null;
  success_fee_paid_at: string | null;
  fee_waived_at: string | null;
  fee_disputed_at: string | null;
  fee_dispute_resolved_at: string | null;
  fee_enforcement: string | null;
}

export function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * The step this deal should be at right now. Pure, so the ladder can be
 * reasoned about and tested without a database or a clock in the way.
 */
export function dueStep(deal: FeeDealRow, config: EnforcementConfig, now = new Date()): EnforcementStep {
  if (!config.enabled) return "none";
  // Paid, waived, or nothing owed: there is nothing to enforce.
  if (deal.success_fee_paid_at || deal.fee_waived_at) return "resolved";
  if (!deal.success_fee_amount || deal.success_fee_amount <= 0) return "none";
  if (!deal.success_fee_invoiced) return "none";
  // An open dispute freezes the ladder where it stands.
  if (deal.fee_disputed_at && !deal.fee_dispute_resolved_at) return (deal.fee_enforcement as EnforcementStep) ?? "none";

  const days = Math.floor((now.getTime() - new Date(deal.closed_at ?? now).getTime()) / 86_400_000);
  if (days >= config.restrictDays) return "account_restricted";
  if (days >= config.pauseDays) return "listing_paused";
  return "reminded";
}

const RANK: Record<EnforcementStep, number> = {
  none: 0, reminded: 1, listing_paused: 2, account_restricted: 3, resolved: 4,
};

/** Escalation only ever moves forward; only payment moves it back. */
export function shouldEscalate(current: string | null, due: EnforcementStep): boolean {
  if (due === "resolved") return current !== "resolved";
  return RANK[due] > RANK[(current as EnforcementStep) ?? "none"];
}

export interface RestrictionState {
  listingPaused: boolean;
  accountRestricted: boolean;
  /** The oldest unpaid fee driving it, for the message shown to the founder. */
  since: string | null;
}

/**
 * What a founder is currently prevented from doing. Read by the surfaces that
 * must refuse -- opening a new listing, accepting a new offer -- so the rule
 * lives in one place instead of being re-derived at each of them.
 */
export async function restrictionsFor(startupId: string): Promise<RestrictionState> {
  const none: RestrictionState = { listingPaused: false, accountRestricted: false, since: null };
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("deals")
      .select("fee_enforcement, fee_enforced_at")
      .eq("startup_id", startupId)
      .in("fee_enforcement", ["listing_paused", "account_restricted"]);
    if (!data?.length) return none;
    return {
      listingPaused: data.some((d) => d.fee_enforcement === "listing_paused" || d.fee_enforcement === "account_restricted"),
      accountRestricted: data.some((d) => d.fee_enforcement === "account_restricted"),
      since: data.map((d) => d.fee_enforced_at).filter(Boolean).sort()[0] ?? null,
    };
  } catch {
    return none;
  }
}
