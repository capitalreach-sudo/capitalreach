import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { notifyUser } from "@/lib/notify-user";
import { logSystemEvent } from "@/lib/system-events";
import { createSuccessFeeInvoice } from "@/lib/stripe";
import { feeState, feeMajor, reminderDue, autoRetryable, DUNNING_DAYS, type FeeDeal } from "@/lib/fees";
import { formatMoney } from "@/lib/currency";

export const dynamic = "force-dynamic";

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
    .select("id, amount, currency, closed_at, success_fee_amount, success_fee_invoiced, success_fee_paid_at, fee_billing_status, fee_reminder_count, fee_reminder_last_at, fee_retry_count, fee_waived_at, startup:startups(id, name, owner_id)")
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

  for (const deal of deals ?? []) {
    const startup = deal.startup as unknown as { id: string; name: string; owner_id: string } | null;
    if (!startup?.owner_id) continue;
    const fd = deal as unknown as FeeDeal;

    // ── 1. Self-heal ────────────────────────────────────────────────────
    if (feeState(fd) === "unbillable") {
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
    reminded++;
  }

  await logSystemEvent("cron/fee-dunning", "info", "Fee ledger swept", { rescued, rescueFailed, reminded, considered: (deals ?? []).length });
  return NextResponse.json({ success: true, rescued, rescueFailed, reminded, considered: (deals ?? []).length });
}
