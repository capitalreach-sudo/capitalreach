import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { notifyUser } from "@/lib/notify-user";
import { logSystemEvent } from "@/lib/system-events";
import { createSuccessFeeInvoice, createFeeInstalmentInvoice } from "@/lib/stripe";
import { feeState, feeMajor, reminderDue, autoRetryable, DUNNING_DAYS, type FeeDeal } from "@/lib/fees";
import { getEnforcementConfig, dueStep, shouldEscalate, type FeeDealRow } from "@/lib/fee-enforcement";
import { formatMoney } from "@/lib/currency";

export const dynamic = "force-dynamic";

/** The states a founder's round may be in (mirrors api/startups/round-state). */
const ROUND_STATES = ["open", "paused", "oversubscribed", "closed"] as const;

/** The rungs that are actively holding something back. */
const ACTIVE_STEPS = ["reminded", "listing_paused", "account_restricted"];

/** The date `days` after `iso`, as YYYY-MM-DD, for the copy. */
function onDate(iso: string | null, days: number): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * E46: chases unpaid success fees, and rescues fees that were never billable.
 *
 * Two jobs, in the order that matters:
 *
 *  1. Self-heal. A fee marked 'no_customer' or 'failed' at close is money the
 *     platform earned and never asked for. The moment the founder has a
 *     Stripe customer — they subscribed, they added a card — the invoice can
 *     finally be raised. Nothing used to notice that, so those fees were lost
 *     permanently.
 *  2. Dunning. An invoiced, unpaid fee gets three reminders (7, 14 and 30 days
 *     after close) and then stops. Past that it is a conversation for a human,
 *     not a notification.
 *
 * Idempotency is in fee_reminder_count / fee_reminder_last_at rather than in
 * the query: reminderDue() refuses to fire twice in a day, so extra runs are
 * harmless.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/fee-dunning] CRON_SECRET is not set — refusing to run.");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data: deals, error } = await admin
    .from("deals")
    .select("id, amount, currency, closed_at, success_fee_amount, success_fee_invoiced, success_fee_paid_at, fee_billing_status, fee_plan_months, fee_reminder_count, fee_reminder_last_at, fee_retry_count, fee_waived_at, fee_disputed_at, fee_dispute_resolved_at, fee_enforcement, fee_enforced_at, fee_paused_round_state, startup:startups(id, name, owner_id, round_state)")
    .not("success_fee_amount", "is", null)
    .is("success_fee_paid_at", null)
    .is("fee_waived_at", null)
    .limit(2000);

  if (error) {
    console.error("[cron/fee-dunning]", error);
    await logSystemEvent("cron/fee-dunning", "error", "Fee query failed", { error: error.message });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  let rescued = 0, rescueFailed = 0, reminded = 0;
  // Deals reminded on this run, so the enforcement pass below does not send a
  // second notification about the same fee on the same day.
  const remindedNow = new Set<string>();

  for (const deal of deals ?? []) {
    const startup = deal.startup as unknown as { id: string; name: string; owner_id: string } | null;
    if (!startup?.owner_id) continue;
    const fd = deal as unknown as FeeDeal;

    // ── 1. Self-heal ────────────────────────────────────────────────────
    if (feeState(fd) === "unbillable") {
      // A fee on an instalment plan is billed one instalment at a time by the
      // loop below. Re-invoicing the WHOLE fee here would bill it a second time
      // in full — this exact 'unbillable + plan' state is what a plan created on
      // a no-customer fee, or on a voided lump invoice, looks like.
      if (deal.fee_plan_months) continue;
      const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", startup.owner_id).maybeSingle();
      if (!autoRetryable(fd, !!profile?.stripe_customer_id)) continue;
      const raised = Number(deal.amount) || 0;
      if (raised <= 0) continue;
      try {
        const invoice = await createSuccessFeeInvoice(profile!.stripe_customer_id!, raised, startup.name, deal.currency ?? "USD", deal.id);
        await admin.from("deals").update({
          success_fee_invoiced: true,
          stripe_invoice_id: invoice.id,
          fee_billing_status: "invoiced",
          fee_billing_error: null,
          fee_retry_count: (deal.fee_retry_count ?? 0) + 1,
          fee_retry_last_at: now.toISOString(),
        }).eq("id", deal.id);
        await notifyUser({
          userId: startup.owner_id,
          type: "fee_due",
          title: "Success fee invoiced",
          body: `The 2% fee on your closed round is now on your billing account.`,
          href: "/dashboard/startup/billing",
        });
        rescued++;
      } catch (err) {
        await admin.from("deals").update({
          fee_billing_error: String((err as Error)?.message ?? err).slice(0, 500),
          fee_retry_count: (deal.fee_retry_count ?? 0) + 1,
          fee_retry_last_at: now.toISOString(),
        }).eq("id", deal.id).then(undefined, () => {});
        rescueFailed++;
      }
      continue;
    }

    // ── 2. Dunning ──────────────────────────────────────────────────────
    if (!reminderDue(fd, now)) continue;
    const sent = deal.fee_reminder_count ?? 0;
    const amount = formatMoney(feeMajor(fd), deal.currency ?? "USD");
    const last = sent + 1 >= DUNNING_DAYS.length;

    await notifyUser({
      userId: startup.owner_id,
      type: "fee_due",
      title: last ? "Final reminder — success fee unpaid" : "Success fee still unpaid",
      body: `${amount} on your closed round. The fee is charged to the startup receiving the investment.`,
      href: "/dashboard/startup/billing",
    });
    await admin.from("deals").update({
      fee_reminder_count: sent + 1,
      fee_reminder_last_at: now.toISOString(),
    }).eq("id", deal.id);
    remindedNow.add(deal.id);
    reminded++;
  }

  // ── Instalment plans (087) ─────────────────────────────────────────────
  // A plan is only a plan if somebody raises the invoices. Each instalment is
  // billed once, on or after its due date, against the exact minor-unit amount
  // the schedule computed — never recomputed here, or the parts stop summing
  // to the whole.
  let instalmentsBilled = 0, instalmentsFailed = 0;
  const today = now.toISOString().slice(0, 10);
  const { data: dueInstalments } = await admin
    .from("fee_instalments")
    .select("id, deal_id, seq, amount, due_date, deal:deals(id, status, currency, success_fee_paid_at, fee_waived_at, fee_refunded_at, fee_chargeback_at, startup:startups(id, name, owner_id))")
    .is("paid_at", null)
    .is("stripe_invoice_id", null)
    .lte("due_date", today)
    .limit(500);

  for (const inst of dueInstalments ?? []) {
    const deal = inst.deal as unknown as { status?: string | null; currency: string | null; success_fee_paid_at?: string | null; fee_waived_at?: string | null; fee_refunded_at?: string | null; fee_chargeback_at?: string | null; startup: { name: string; owner_id: string } | null } | null;
    const owner = deal?.startup?.owner_id;
    if (!owner) continue;
    // Never bill an instalment for a fee that is settled or reversed at the
    // DEAL level. Waive/markPaid/refund/chargeback touch only the deal, not
    // the schedule — so without this the cron kept charging a paid, waived or
    // refunded fee. Also skip a deal that is no longer closed (un-closed).
    if (deal.success_fee_paid_at || deal.fee_waived_at || deal.fee_refunded_at || deal.fee_chargeback_at || deal.status !== "closed") {
      continue;
    }

    const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", owner).maybeSingle();
    if (!profile?.stripe_customer_id) {
      // No card on file: this is the ledger's 'no_customer' case, one
      // instalment at a time. Recorded, not silently skipped forever.
      await admin.from("fee_instalments")
        .update({ billing_error: "No payment method on file" })
        .eq("id", inst.id).then(undefined, () => {});
      instalmentsFailed++;
      continue;
    }

    try {
      const invoice = await createFeeInstalmentInvoice(
        profile.stripe_customer_id,
        Number(inst.amount),
        deal?.currency ?? "USD",
        `CapitalReach success fee — instalment ${inst.seq}`,
        inst.deal_id,
        inst.id,
      );
      await admin.from("fee_instalments")
        .update({ stripe_invoice_id: invoice.id, billing_error: null })
        .eq("id", inst.id);
      await notifyUser({
        userId: owner,
        type: "fee_due",
        title: `Success fee — instalment ${inst.seq}`,
        body: "The next instalment of your success fee has been invoiced.",
        href: "/dashboard/startup/billing",
      });
      instalmentsBilled++;
    } catch (err) {
      await admin.from("fee_instalments")
        .update({ billing_error: String((err as Error)?.message ?? err).slice(0, 400) })
        .eq("id", inst.id).then(undefined, () => {});
      instalmentsFailed++;
    }
  }

  // ── 3. The enforcement ladder (migration 118) ──────────────────────────
  // Reminders alone are a donation: the founders who ignore three of them are
  // exactly the ones who go on ignoring them. From here an unpaid fee costs
  // something, on a dated ladder that is graduated, announced in advance, and
  // reversed in full by one payment. Nothing below removes anything a founder
  // has -- listing, data room, documents, messages and deals in flight are
  // untouched at every step. What is withheld is more of a platform they have
  // not paid for.
  const config = await getEnforcementConfig();
  let stepped = 0, listingsPaused = 0, accountsRestricted = 0;

  if (config.enabled) {
    // A fee being paid on an agreed schedule is not late. For a planned fee the
    // ladder's clock starts at the OLDEST missed instalment instead of at close,
    // so a founder who is up to date is never escalated, and one who stopped
    // paying is measured from the day they stopped rather than from a close date
    // months earlier that would drop them straight onto the last rung.
    const plannedIds = (deals ?? []).filter(d => d.fee_plan_months).map(d => d.id);
    const missedSince = new Map<string, string>();
    if (plannedIds.length) {
      const { data: missed } = await admin
        .from("fee_instalments")
        .select("deal_id, due_date")
        .in("deal_id", plannedIds)
        .is("paid_at", null)
        .lte("due_date", today)
        .order("due_date");
      for (const r of missed ?? []) {
        if (!missedSince.has(r.deal_id)) missedSince.set(r.deal_id, r.due_date);
      }
    }

    /**
     * Pause the round, remembering what it was.
     *
     * The prior state is written to the DEAL first and the listing is moved
     * second. A crash between the two leaves a memory and no pause, which is
     * recoverable; the other order leaves a paused round nobody can restore.
     * Returns null when the memory could not be written, in which case the
     * pause does not happen at all.
     */
    const pauseListing = async (
      dealId: string,
      startup: { id: string; round_state: string | null },
    ): Promise<{ prior: string; moved: boolean } | null> => {
      const prior = (ROUND_STATES as readonly string[]).includes(startup.round_state ?? "")
        ? (startup.round_state as string)
        : "open";
      const { error } = await admin.from("deals")
        .update({ fee_paused_round_state: prior }).eq("id", dealId);
      if (error) return null;
      // A round that is already paused or closed is not receiving introductions
      // anyway, so there is nothing to take away today -- and moving 'closed' to
      // 'paused' would be rewriting a founder's own statement about their round.
      const moved = prior === "open" || prior === "oversubscribed";
      if (moved) {
        await admin.from("startups")
          .update({ round_state: "paused", round_state_changed_at: now.toISOString() })
          .eq("id", startup.id);
      }
      return { prior, moved };
    };

    for (const deal of deals ?? []) {
      const startup = deal.startup as unknown as { id: string; name: string; owner_id: string; round_state: string | null } | null;
      if (!startup?.owner_id) continue;

      const clockFrom = deal.fee_plan_months ? (missedSince.get(deal.id) ?? null) : deal.closed_at;
      if (!clockFrom) continue; // on schedule, or no clock to measure from

      const row: FeeDealRow = {
        id: deal.id,
        startup_id: startup.id,
        closed_at: clockFrom,
        success_fee_amount: deal.success_fee_amount,
        success_fee_invoiced: deal.success_fee_invoiced,
        success_fee_paid_at: deal.success_fee_paid_at,
        fee_waived_at: deal.fee_waived_at,
        fee_disputed_at: deal.fee_disputed_at,
        fee_dispute_resolved_at: deal.fee_dispute_resolved_at,
        fee_enforcement: deal.fee_enforcement,
      };
      const due = dueStep(row, config, now);
      // 'resolved' is handled by the reversal pass below, which runs whether or
      // not the ladder is switched on.
      if (due === "resolved" || !shouldEscalate(deal.fee_enforcement, due)) continue;

      const amount = formatMoney(feeMajor(deal as unknown as FeeDeal), deal.currency ?? "USD");
      const stamp = now.toISOString();

      if (due === "reminded") {
        await admin.from("deals")
          .update({ fee_enforcement: "reminded", fee_enforced_at: stamp }).eq("id", deal.id);
        // The dunning pass above may have chased this exact fee minutes ago.
        // Two notifications about one invoice on one day is how people learn to
        // ignore the bell.
        if (!remindedNow.has(deal.id)) {
          await notifyUser({
            userId: startup.owner_id,
            type: "fee_due",
            title: "Success fee outstanding",
            body: `${amount} is outstanding. If it is unpaid on ${onDate(clockFrom, config.pauseDays)}, your listing pauses. Paying the invoice settles it.`,
            titleKey: "notif.feeStepRemindedTitle",
            bodyKey: "notif.feeStepRemindedBody",
            params: { amount, date: onDate(clockFrom, config.pauseDays) },
            href: "/dashboard/startup/fees",
          });
        }
        stepped++;
        continue;
      }

      if (due === "listing_paused") {
        const paused = await pauseListing(deal.id, startup);
        if (!paused) continue;
        await admin.from("deals")
          .update({ fee_enforcement: "listing_paused", fee_enforced_at: stamp }).eq("id", deal.id);
        await notifyUser({
          userId: startup.owner_id,
          type: "fee_due",
          title: `Your listing is paused: ${amount} outstanding`,
          body: paused.moved
            ? `Your round moved from ${paused.prior} to paused today. Your listing, data room, documents, messages and deals in progress are unchanged. Paying the invoice puts your round back to ${paused.prior}.`
            : `Your round was already ${paused.prior}, so nothing changed today. It stays that way while the fee is unpaid. Nothing has been removed. Paying the invoice lifts it.`,
          titleKey: "notif.feePausedTitle",
          bodyKey: paused.moved ? "notif.feePausedBody" : "notif.feePausedBodyNoChange",
          params: { amount, state: paused.prior },
          href: "/dashboard/startup/fees",
        });
        // The people watching this listing are not told why it paused. A
        // founder's arrears are between them and the platform.
        listingsPaused++;
        stepped++;
        continue;
      }

      // account_restricted. The ladder is cumulative, so a fee that arrives here
      // without having passed through the pause -- an old fee on the day the
      // ladder is switched on -- gets the pause bookkeeping too, or
      // restrictionsFor() would report a listing paused that never was.
      if (deal.fee_enforcement !== "listing_paused") {
        await pauseListing(deal.id, startup);
      }
      await admin.from("deals")
        .update({ fee_enforcement: "account_restricted", fee_enforced_at: stamp }).eq("id", deal.id);
      await notifyUser({
        userId: startup.owner_id,
        type: "fee_due",
        title: `New listings and new offers on hold: ${amount} outstanding`,
        body: `Outstanding since ${String(clockFrom).slice(0, 10)}. You cannot open a new listing or accept a new offer until it is paid. Everything you have stays: your listing, data room, documents, messages and deals in progress. Paying the invoice lifts this.`,
        titleKey: "notif.feeRestrictedTitle",
        bodyKey: "notif.feeRestrictedBody",
        params: { amount, date: String(clockFrom).slice(0, 10) },
        href: "/dashboard/startup/fees",
      });
      accountsRestricted++;
      stepped++;
    }
  }

  // ── 4. Reversal ────────────────────────────────────────────────────────
  // Everything the ladder does is undone by paying the invoice -- and by a
  // write-off, which is what an upheld dispute becomes. This pass runs whether
  // or not the ladder is switched on: a round paused last month must come back
  // when the money arrives, even if an operator has since turned enforcement
  // off. Restoring never invents a state; it puts back the one that was
  // recorded on the way in.
  let lifted = 0, roundsRestored = 0;
  const { data: enforced } = await admin
    .from("deals")
    .select("id, startup_id, currency, success_fee_amount, success_fee_invoiced, success_fee_paid_at, fee_billing_status, fee_waived_at, fee_refunded_at, fee_chargeback_at, fee_chargeback_resolved_at, fee_disputed_at, fee_dispute_resolved_at, fee_enforcement, fee_paused_round_state, startup:startups(id, name, owner_id, round_state)")
    .in("fee_enforcement", ACTIVE_STEPS)
    .limit(1000);

  const isSettled = (d: unknown) => {
    const s = feeState(d as FeeDeal);
    return s === "collected" || s === "waived";
  };
  /** Listings whose round this run has already put back, and to what. */
  const restoredRounds = new Map<string, string>();

  for (const deal of enforced ?? []) {
    if (!isSettled(deal)) continue;
    const startup = deal.startup as unknown as { id: string; name: string; owner_id: string; round_state: string | null } | null;
    const wasHolding = deal.fee_enforcement === "listing_paused" || deal.fee_enforcement === "account_restricted";
    let restoredTo: string | null = null;

    if (startup && wasHolding) {
      // Another unpaid fee on the same listing may be holding the same pause.
      // The round comes back when the LAST of them is settled, not the first.
      const stillHolding = (enforced ?? []).some(other =>
        other.id !== deal.id
        && other.startup_id === deal.startup_id
        && (other.fee_enforcement === "listing_paused" || other.fee_enforcement === "account_restricted")
        && !isSettled(other));

      const prior = deal.fee_paused_round_state;
      const valid = !!prior && (ROUND_STATES as readonly string[]).includes(prior);
      // Two settled fees on one listing hold one pause between them. The second
      // must not re-issue the same restore against a row that has already moved
      // -- it would count twice and read as a second event to the founder.
      const already = restoredRounds.get(startup.id);
      if (already) {
        restoredTo = already;
      } else if (!stillHolding && valid && prior !== "paused" && startup.round_state === "paused") {
        // Only ever restores a round the ladder itself paused. A founder who has
        // since chosen some other state owns that choice.
        const { error } = await admin.from("startups")
          .update({ round_state: prior, round_state_changed_at: now.toISOString() })
          .eq("id", startup.id)
          .eq("round_state", "paused");
        if (!error) {
          restoredTo = prior as string;
          restoredRounds.set(startup.id, prior as string);
          roundsRestored++;
        }
      }
    }

    await admin.from("deals")
      .update({ fee_enforcement: "resolved", fee_enforced_at: now.toISOString() })
      .eq("id", deal.id);
    lifted++;

    // A fee that only ever reached 'reminded' held nothing back, so settling it
    // needs no announcement -- Stripe's own receipt is the news there.
    if (!startup?.owner_id || !wasHolding) continue;
    const waived = !!deal.fee_waived_at || deal.fee_billing_status === "waived";
    await notifyUser({
      userId: startup.owner_id,
      type: "fee_due",
      title: waived ? "Success fee written off" : "Success fee settled",
      body: restoredTo
        ? `Every hold from this fee is lifted. Your round is back to ${restoredTo}.`
        : "Every hold from this fee is lifted.",
      titleKey: waived ? "notif.feeLiftedWaivedTitle" : "notif.feeLiftedTitle",
      bodyKey: restoredTo ? "notif.feeLiftedBodyRestored" : "notif.feeLiftedBody",
      params: restoredTo ? { state: restoredTo } : {},
      href: "/dashboard/startup/fees",
    });
  }

  const summary = {
    rescued, rescueFailed, reminded, instalmentsBilled, instalmentsFailed,
    stepped, listingsPaused, accountsRestricted, lifted, roundsRestored,
    considered: (deals ?? []).length,
  };
  await logSystemEvent("cron/fee-dunning", "info", "Fee ledger swept", summary);
  return NextResponse.json({ success: true, ...summary });
}
