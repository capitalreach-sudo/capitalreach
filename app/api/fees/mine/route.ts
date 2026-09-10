import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { notifyUsers } from "@/lib/notify-user";
import { feeState, feeMajor, type FeeDeal } from "@/lib/fees";
import {
  getEnforcementConfig, restrictionsFor,
  type EnforcementConfig, type EnforcementStep,
} from "@/lib/fee-enforcement";
import Stripe from "stripe";
import { isUuid } from "@/lib/utils";

/**
 * E47: the founder's side of the success fee.
 *
 * E46 gave the operator a ledger and three reminders. The other half of that
 * conversation did not exist — a founder got an invoice for 2% of their round
 * and nowhere on the platform said what it was for, what state it was in, or
 * what to do if the amount was wrong. The only way to disagree was to ignore
 * the reminders, which the platform read as non-payment.
 *
 * 118 adds the half after that: an unpaid fee now has consequences on a dated
 * ladder, so this route also has to say which step a fee is on, which step is
 * next, and on what date — before it happens, not after.
 *
 * GET  — every fee raised against this founder's listing, with its place on
 *        the enforcement ladder and the one action that reverses it.
 * POST — { dealId, reason } opens a dispute, which pauses dunning and freezes
 *        the ladder where it stands.
 */

const COLUMNS = "id, amount, currency, closed_at, success_fee_amount, success_fee_invoiced, success_fee_paid_at, stripe_invoice_id, fee_billing_status, fee_reminder_count, fee_plan_months, fee_waived_at, fee_refunded_at, fee_chargeback_at, fee_chargeback_resolved_at, fee_disputed_at, fee_dispute_reason, fee_dispute_resolved_at, fee_dispute_resolution, fee_enforcement, fee_enforced_at, fee_paused_round_state, investor:investors(display_name, firm_name, is_external)";

/** The states a founder's round may be in (mirrors api/startups/round-state). */
const ROUND_STATES = ["open", "paused", "oversubscribed", "closed"] as const;

/** The rungs that are actively holding something back. */
const ACTIVE_STEPS = ["reminded", "listing_paused", "account_restricted"];

async function myStartup(userId: string) {
  const admin = createAdminClient();
  // Service role: migration 109 revoked the financial columns of `startups`
  // from client keys, and ownership is proven by the owner_id filter itself.
  const { data, error } = await admin
    .from("startups").select("id, name, round_state").eq("owner_id", userId).maybeSingle();
  // maybeSingle() reports "no row" as data null with no error, so a null here
  // alongside an error is a failed read rather than a founder with no listing.
  // The two must not answer the same, one being a fact and the other a guess.
  return { admin, startup: data, failed: !!error };
}

/**
 * The hosted Stripe page for an invoice — the actual "pay now" URL. Looked up
 * live rather than stored: Stripe rotates hosted URLs when an invoice is
 * revised, and a stale stored link is a dead payment button.
 * Null when Stripe is unconfigured or the lookup fails; the page then shows
 * state without a button, which is honest.
 */
async function hostedPayUrl(invoiceId: string | null): Promise<string | null> {
  if (!invoiceId || !process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes("placeholder")) return null;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const inv = await stripe.invoices.retrieve(invoiceId);
    return inv.hosted_invoice_url ?? null;
  } catch {
    return null;
  }
}

type DealRow = {
  id: string;
  closed_at: string | null;
  fee_enforcement: string | null;
  fee_paused_round_state: string | null;
  fee_plan_months: number | null;
};

function settledFee(d: unknown): boolean {
  const s = feeState(d as FeeDeal);
  return s === "collected" || s === "waived";
}

/**
 * Reversal, on the founder's own next page load.
 *
 * The nightly cron is the system of record for the ladder, but it runs once a
 * day: a founder who pays their invoice at ten in the morning would otherwise
 * sit on a paused round until nine the next. Payment is meant to reverse this
 * immediately, so the portal repairs what it finds — for this caller's own
 * listing only, and only ever in the direction of restoring.
 *
 * Nothing here can restrict anything. It lifts, or it does nothing.
 */
async function liftSettledEnforcement(
  admin: ReturnType<typeof createAdminClient>,
  startup: { id: string; round_state: string | null },
  deals: DealRow[],
): Promise<{ lifted: number; roundState: string | null; restoredTo: string | null }> {
  const idle = { lifted: 0, roundState: startup.round_state, restoredTo: null };

  const settled = deals.filter(d => ACTIVE_STEPS.includes(d.fee_enforcement ?? "") && settledFee(d));
  if (settled.length === 0) return idle;

  let roundState = startup.round_state;
  let restoredTo: string | null = null;

  // Another unpaid fee on the same listing may be holding the same pause. The
  // round comes back when the LAST of them is settled, not the first.
  const stillHolding = deals.some(d =>
    !settled.includes(d)
    && (d.fee_enforcement === "listing_paused" || d.fee_enforcement === "account_restricted")
    && !settledFee(d));

  const prior = settled
    .map(d => d.fee_paused_round_state)
    .find((v): v is string => !!v && (ROUND_STATES as readonly string[]).includes(v));

  // Restore only a round the ladder itself paused. A founder who has since
  // chosen some other state owns that choice, and overwriting it would be the
  // enforcement acting after it was paid for.
  if (!stillHolding && prior && prior !== "paused" && roundState === "paused") {
    const { error } = await admin.from("startups")
      .update({ round_state: prior, round_state_changed_at: new Date().toISOString() })
      .eq("id", startup.id)
      .eq("round_state", "paused");
    if (!error) { roundState = prior; restoredTo = prior; }
  }

  const { error: cleared } = await admin.from("deals")
    .update({ fee_enforcement: "resolved", fee_enforced_at: new Date().toISOString() })
    .in("id", settled.map(d => d.id));
  // A lift that did not persist must not be announced. The page reads a
  // non-zero count as "every hold from this fee is lifted" and shows it instead
  // of the standing hold, so claiming it here would tell a founder their round
  // is back while the ladder still has it.
  if (cleared) return { lifted: 0, roundState, restoredTo };
  for (const d of settled) d.fee_enforcement = "resolved";

  return { lifted: settled.length, roundState, restoredTo };
}

/** The date `days` after `iso`, as YYYY-MM-DD. */
function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface NextConsequence { step: EnforcementStep; on: string }

/**
 * What happens to this fee next, and on what date.
 *
 * Deliberately computed from the same config and the same clock start the cron
 * uses, so the date a founder is shown is the date the ladder will actually
 * act on. A promise about a consequence is worth nothing if the two disagree.
 */
function nextConsequence(
  current: string | null,
  clockFrom: string | null,
  config: EnforcementConfig,
): NextConsequence | null {
  if (!config.enabled || !clockFrom) return null;
  if (current === "account_restricted") return null; // top of the ladder
  if (current === "listing_paused") {
    return { step: "account_restricted", on: addDays(clockFrom, config.restrictDays) };
  }
  return { step: "listing_paused", on: addDays(clockFrom, config.pauseDays) };
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { admin, startup, failed } = await myStartup(user.id);
  if (failed) return NextResponse.json({ error: "Could not read your listing" }, { status: 500 });
  if (!startup) return NextResponse.json({ fees: [], enforcement: null });

  const { data, error } = await admin
    .from("deals")
    .select(COLUMNS)
    .eq("startup_id", startup.id)
    .not("success_fee_amount", "is", null)
    .order("closed_at", { ascending: false })
    .limit(100);

  // An unread ledger is not an empty one. Returning [] here is the sentence
  // "no success fee has been raised on your listing", which is a claim about
  // money -- and an unpaid fee now pauses the listing at 14 days, so the
  // reassuring version of this failure is the expensive one. No fees at all is
  // still a 200 with an empty list below: that one is a fact.
  if (error) return NextResponse.json({ error: "Could not read your fees" }, { status: 500 });

  const rows = data ?? [];
  const repair = await liftSettledEnforcement(admin, startup, rows as unknown as DealRow[]);

  const config = await getEnforcementConfig();

  // A fee being paid on an agreed schedule is not late. The ladder's clock for
  // a planned fee starts at the OLDEST missed instalment rather than at close,
  // so a founder who is up to date on their plan is never escalated and one who
  // stopped paying is measured from the day they stopped.
  const plannedIds = rows.filter(d => d.fee_plan_months).map(d => d.id);
  const overdue = new Map<string, { seq: number; due: string }>();
  if (plannedIds.length) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: inst, error: instError } = await admin
      .from("fee_instalments")
      .select("deal_id, seq, due_date")
      .in("deal_id", plannedIds)
      .is("paid_at", null)
      .lte("due_date", today)
      .order("due_date");
    // An unread schedule is indistinguishable from one with nothing overdue,
    // and the portal says that out loud as "you are up to date on your plan".
    if (instError) return NextResponse.json({ error: "Could not read your payment plan" }, { status: 500 });
    for (const r of inst ?? []) {
      if (!overdue.has(r.deal_id)) overdue.set(r.deal_id, { seq: r.seq, due: r.due_date });
    }
  }

  const fees = await Promise.all(rows.map(async d => {
    const inv = d.investor as unknown as { display_name: string | null; firm_name: string | null } | null;
    const state = feeState(d as unknown as FeeDeal);
    const disputeOpen = !!d.fee_disputed_at && !d.fee_dispute_resolved_at;
    const missed = overdue.get(d.id) ?? null;
    // A plan with nothing overdue has no clock running at all.
    const clockFrom = d.fee_plan_months ? (missed?.due ?? null) : d.closed_at;
    return {
      id: d.id,
      // The round this fee is 2% of. Shown beside the fee so the arithmetic is
      // visible rather than asserted.
      raised: d.amount,
      amount: d.amount,
      currency: d.currency,
      closedAt: d.closed_at,
      feeMajor: feeMajor(d as unknown as FeeDeal),
      state,
      investorName: inv?.firm_name || inv?.display_name || null,
      disputeReason: d.fee_dispute_reason,
      disputeResolution: d.fee_dispute_resolution,
      disputedAt: d.fee_disputed_at,
      resolvedAt: d.fee_dispute_resolved_at,
      invoiced: !!d.success_fee_invoiced,
      planMonths: d.fee_plan_months ?? null,
      overdueInstalment: missed,
      // Where this fee sits on the ladder, and what comes next.
      enforcement: (d.fee_enforcement as EnforcementStep | null) ?? null,
      enforcedAt: d.fee_enforced_at,
      pausedFrom: d.fee_paused_round_state,
      // A dispute freezes the ladder: somebody who says "this is wrong" is
      // having a conversation, not defaulting.
      frozen: disputeOpen,
      next: state === "outstanding" && !disputeOpen
        ? nextConsequence(d.fee_enforcement, clockFrom, config)
        : null,
      // The pay area: only an OUTSTANDING fee gets a button — a paid, waived
      // or disputed one has nothing to pay right now.
      payUrl: state === "outstanding"
        ? await hostedPayUrl(d.stripe_invoice_id)
        : null,
    };
  }));
  const visible = fees.filter(f => f.state !== "none");

  // Read back through the contract rather than re-deriving it here, so the
  // portal and the surfaces that refuse an action agree on what is held.
  const restrictions = await restrictionsFor(startup.id);

  return NextResponse.json({
    fees: visible,
    enforcement: {
      enabled: config.enabled,
      pauseDays: config.pauseDays,
      restrictDays: config.restrictDays,
      listingPaused: restrictions.listingPaused,
      accountRestricted: restrictions.accountRestricted,
      since: restrictions.since,
      roundState: repair.roundState,
      // Non-zero only on the load that repaired something, so the page can
      // confirm the reversal to the person who just paid for it.
      justLifted: repair.lifted,
      restoredTo: repair.restoredTo,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dealId, reason } = await req.json().catch(() => ({}));
  if (!isUuid(dealId ?? "")) return NextResponse.json({ error: "dealId required" }, { status: 400 });
  const why = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 1000) : null;
  if (!why) return NextResponse.json({ error: "Tell us what is wrong with the amount." }, { status: 400 });

  const { admin, startup, failed } = await myStartup(user.id);
  if (failed) return NextResponse.json({ error: "Could not read your listing" }, { status: 500 });
  if (!startup) return NextResponse.json({ error: "You have no listing." }, { status: 403 });

  const { data: deal, error: dealError } = await admin.from("deals").select("startup_id, investor_id, id, amount, currency, closed_at, success_fee_amount, success_fee_invoiced, success_fee_paid_at, fee_billing_status, fee_waived_at, fee_disputed_at, fee_dispute_resolved_at, fee_enforcement").eq("id", dealId).maybeSingle();
  // Telling a founder their fee does not exist is the one answer a failed read
  // must never give: the dispute is their way of contesting the amount.
  if (dealError) return NextResponse.json({ error: "Could not read the fee" }, { status: 500 });
  // Scoped to the caller's own listing: the fee belongs to the startup that
  // received the investment, so nobody else can open a dispute on it.
  if (!deal || deal.startup_id !== startup.id) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const state = feeState(deal as unknown as FeeDeal);
  if (state === "none") return NextResponse.json({ error: "There is no fee on this deal." }, { status: 400 });
  if (state === "collected") return NextResponse.json({ error: "This fee is already paid. Contact support instead." }, { status: 409 });
  if (state === "waived") return NextResponse.json({ error: "This fee has already been written off." }, { status: 409 });
  if (state === "disputed") return NextResponse.json({ error: "This fee is already under review." }, { status: 409 });

  const now = new Date().toISOString();
  const { error } = await admin.from("deals")
    .update({ fee_disputed_at: now, fee_dispute_reason: why, fee_dispute_resolved_at: null, fee_dispute_resolution: null })
    .eq("id", dealId);
  if (error) return NextResponse.json({ error: "Could not open the dispute" }, { status: 500 });

  await admin.from("deal_activity").insert({
    deal_id: dealId, startup_id: deal.startup_id, investor_id: deal.investor_id, actor_id: user.id,
    type: "note", body: "Success fee disputed by the founder.",
  }).then(undefined, () => {});

  // Whoever runs the platform needs to see this without checking a table.
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").limit(20);
  const adminIds = (admins ?? []).map(a => a.id);
  if (adminIds.length) {
    await notifyUsers(adminIds, {
      type: "fee_due",
      title: `Fee disputed — ${startup.name}`,
      body: why.slice(0, 140),
      href: "/admin",
    }).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    state: "disputed",
    // The ladder stops where it is for as long as this is open. It does not
    // step back: an open dispute is not yet an answer.
    frozenAt: (deal.fee_enforcement as EnforcementStep | null) ?? "none",
  });
}
