import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";
import { createSuccessFeeInvoice } from "@/lib/stripe";
import { notifyUser } from "@/lib/notify-user";
import { feeState, feeMajor, ledgerTotals, type FeeDeal } from "@/lib/fees";
import { isUuid } from "@/lib/utils";

/**
 * E46: the success-fee ledger.
 *
 * GET  — every deal that owes a fee, with its state and how often it has
 *        been chased. This list did not exist: an operator could see that
 *        a fee had failed only by reading one deal at a time.
 * POST — { dealId, action: "retry" | "waive" | "markPaid", reason?, note? }
 *
 * `retry` raises the invoice that could not be raised at close, which is the
 * common case once a founder finally adds a card. `waive` writes the fee off
 * on purpose and records who did it. `markPaid` records payment that arrived
 * outside Stripe — a bank transfer is still payment, and the ledger has to be
 * able to say so without inventing a Stripe charge.
 */

const LEDGER_COLUMNS =
  "id, amount, currency, closed_at, fee_disputed_at, fee_dispute_reason, fee_dispute_resolved_at, fee_dispute_resolution, success_fee_amount, success_fee_invoiced, success_fee_paid_at, stripe_invoice_id, fee_billing_status, fee_billing_error, fee_reminder_count, fee_reminder_last_at, fee_retry_count, fee_retry_last_at, fee_waived_at, fee_waived_by, fee_waive_reason, startup:startups(id, name, slug, owner_id), investor:investors(display_name)";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { data, error } = await guard.admin
    .from("deals")
    .select(LEDGER_COLUMNS)
    .not("success_fee_amount", "is", null)
    .order("closed_at", { ascending: false })
    .limit(2000);
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

  const rows = (data ?? []).map((d) => ({
    ...d,
    state: feeState(d as unknown as FeeDeal),
    feeMajor: feeMajor(d as unknown as FeeDeal),
    startupName: (d.startup as unknown as { name: string } | null)?.name ?? null,
    startupSlug: (d.startup as unknown as { slug: string } | null)?.slug ?? null,
  })).filter(r => r.state !== "none");

  return NextResponse.json({
    rows,
    totals: ledgerTotals((data ?? []) as unknown as FeeDeal[]),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const { dealId, action, reason } = await req.json().catch(() => ({}));
  if (!isUuid(dealId ?? "")) return NextResponse.json({ error: "dealId required" }, { status: 400 });
  if (!["retry", "waive", "markPaid", "resolveDispute"].includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { data: deal } = await admin.from("deals").select(LEDGER_COLUMNS).eq("id", dealId).maybeSingle();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  const state = feeState(deal as unknown as FeeDeal);
  if (state === "none") return NextResponse.json({ error: "This deal has no fee." }, { status: 400 });
  if (state === "collected") return NextResponse.json({ error: "This fee is already settled." }, { status: 409 });

  const startup = deal.startup as unknown as { id: string; name: string; owner_id: string } | null;
  const now = new Date().toISOString();

  // E47: a dispute has to be closed by a person either way. Resolving it does
  // not decide the fee — it just puts the deal back in a state the ledger can
  // act on, with the reasoning on record.
  if (action === "resolveDispute") {
    if (state !== "disputed") return NextResponse.json({ error: "This fee is not under dispute." }, { status: 409 });
    const note = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;
    if (!note) return NextResponse.json({ error: "Record how the dispute was resolved." }, { status: 400 });
    const { error } = await admin.from("deals")
      .update({ fee_dispute_resolved_at: now, fee_dispute_resolution: note })
      .eq("id", dealId);
    if (error) return NextResponse.json({ error: "Could not resolve it" }, { status: 500 });
    await logAdminAction(admin, guard.adminId, "fee_dispute_resolved", "startup", startup?.id ?? null, { dealId, resolution: note });
    if (startup?.owner_id) {
      await notifyUser({
        userId: startup.owner_id,
        type: "fee_due",
        title: "Your fee dispute was reviewed",
        body: note.slice(0, 140),
        href: "/dashboard/startup/billing",
      }).catch(() => {});
    }
    return NextResponse.json({ success: true, state: "outstanding" });
  }

  if (action === "waive") {
    const why = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 300) : null;
    if (!why) return NextResponse.json({ error: "A waive needs a reason." }, { status: 400 });
    const { error } = await admin.from("deals")
      .update({ fee_waived_at: now, fee_waived_by: guard.adminId, fee_waive_reason: why, fee_billing_status: "waived" })
      .eq("id", dealId);
    if (error) return NextResponse.json({ error: "Could not waive it" }, { status: 500 });
    await logAdminAction(admin, guard.adminId, "fee_waived", "startup", startup?.id ?? null, { dealId, reason: why, amount: feeMajor(deal as unknown as FeeDeal) });
    return NextResponse.json({ success: true, state: "waived" });
  }

  if (action === "markPaid") {
    const why = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 300) : null;
    const { error } = await admin.from("deals")
      .update({ success_fee_paid_at: now, fee_billing_status: "paid_offline", fee_waive_reason: why })
      .eq("id", dealId);
    if (error) return NextResponse.json({ error: "Could not record it" }, { status: 500 });
    await logAdminAction(admin, guard.adminId, "fee_marked_paid", "startup", startup?.id ?? null, { dealId, note: why, amount: feeMajor(deal as unknown as FeeDeal) });
    return NextResponse.json({ success: true, state: "collected" });
  }

  // retry
  if (state !== "unbillable") return NextResponse.json({ error: "Only an unbilled fee can be retried." }, { status: 409 });
  if (!startup?.owner_id) return NextResponse.json({ error: "This listing has no owner." }, { status: 409 });

  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", startup.owner_id).maybeSingle();
  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "The founder still has no payment method on file. Nothing to retry against." }, { status: 409 });
  }
  // success_fee_amount is minor units of the fee; createSuccessFeeInvoice
  // takes the amount RAISED and applies the 2% itself.
  const raised = Number(deal.amount) || 0;
  if (raised <= 0) return NextResponse.json({ error: "The deal has no amount to bill against." }, { status: 409 });

  try {
    const invoice = await createSuccessFeeInvoice(profile.stripe_customer_id, raised, startup.name, deal.currency ?? "USD", dealId);
    await admin.from("deals").update({
      success_fee_invoiced: true,
      stripe_invoice_id: invoice.id,
      fee_billing_status: "invoiced",
      fee_billing_error: null,
      fee_retry_count: (deal.fee_retry_count ?? 0) + 1,
      fee_retry_last_at: now,
    }).eq("id", dealId);
    await logAdminAction(admin, guard.adminId, "fee_retried", "startup", startup.id, { dealId, invoiceId: invoice.id });
    await notifyUser({
      userId: startup.owner_id,
      type: "fee_due",
      title: "Success fee invoice",
      body: `The 2% success fee on your closed round has been invoiced.`,
      href: "/dashboard/startup/billing",
    }).catch(() => {});
    return NextResponse.json({ success: true, state: "outstanding", invoiceUrl: invoice.hosted_invoice_url ?? null });
  } catch (err) {
    const message = String((err as Error)?.message ?? err).slice(0, 500);
    await admin.from("deals").update({
      fee_billing_status: "failed",
      fee_billing_error: message,
      fee_retry_count: (deal.fee_retry_count ?? 0) + 1,
      fee_retry_last_at: now,
    }).eq("id", dealId);
    return NextResponse.json({ error: `Stripe refused it: ${message}` }, { status: 502 });
  }
}
