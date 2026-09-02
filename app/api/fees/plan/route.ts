import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { notifyUsers } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";
import { feeState, type FeeDeal } from "@/lib/fees";
import { voidInvoice } from "@/lib/stripe";
import {
  planInstalments, planAllowed, planProgress,
  MIN_PLAN_MONTHS, MAX_PLAN_MONTHS,
} from "@/lib/fee-plan";

/**
 * Spread the 2% success fee over a few months.
 *
 * The fee arrives as one invoice on the day a round closes — the worst day to
 * ask a founder for cash, because the money is committed and often not yet in
 * the account. The ledger could chase it and the founder could dispute it;
 * neither answered the actual objection, which is timing rather than amount.
 *
 * The founder asks for the plan themselves, on their own fee, and the plan is
 * only ever a schedule: same total, same money owed. Nothing here can reduce
 * what is due, which is why the amounts are computed server-side from
 * success_fee_amount and never taken from the request.
 *
 * GET  ?dealId= — the current schedule, if any.
 * POST { dealId, months } — start one.
 */

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId") ?? "";
  if (!isUuid(dealId)) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  const admin = createAdminClient();
  const deal = await ownFeeDeal(admin, user.id, dealId);
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const { data: rows } = await admin
    .from("fee_instalments")
    .select("seq, amount, due_date, paid_at, billing_error")
    .eq("deal_id", dealId)
    .order("seq");

  const instalments = rows ?? [];
  return NextResponse.json({
    instalments,
    progress: instalments.length ? planProgress(instalments) : null,
    eligible: planAllowed(deal.success_fee_amount) && instalments.length === 0
      && ["outstanding", "unbillable"].includes(feeState(deal as unknown as FeeDeal)),
    minMonths: MIN_PLAN_MONTHS,
    maxMonths: MAX_PLAN_MONTHS,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dealId, months } = await req.json().catch(() => ({}));
  if (!isUuid(dealId ?? "")) return NextResponse.json({ error: "dealId required" }, { status: 400 });
  const term = Math.trunc(Number(months));
  if (!Number.isFinite(term) || term < MIN_PLAN_MONTHS || term > MAX_PLAN_MONTHS) {
    return NextResponse.json({ error: `Choose between ${MIN_PLAN_MONTHS} and ${MAX_PLAN_MONTHS} months.` }, { status: 400 });
  }

  const admin = createAdminClient();
  const deal = await ownFeeDeal(admin, user.id, dealId);
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const state = feeState(deal as unknown as FeeDeal);
  if (state === "collected") return NextResponse.json({ error: "This fee is already paid." }, { status: 409 });
  if (state === "waived") return NextResponse.json({ error: "This fee has been written off." }, { status: 409 });
  if (state === "disputed") return NextResponse.json({ error: "This fee is under review. The schedule can wait until that is settled." }, { status: 409 });
  if (state === "reversed") return NextResponse.json({ error: "This fee was reversed — there is nothing to schedule." }, { status: 409 });
  if (!planAllowed(deal.success_fee_amount)) {
    return NextResponse.json({ error: "This fee is small enough to pay in one go." }, { status: 409 });
  }

  // One plan per deal. Re-planning a fee already part-paid would mean
  // recomputing around money that has moved, and a payer who can reschedule
  // their own overdue payments does not have a schedule.
  const { count: existing } = await admin
    .from("fee_instalments").select("id", { count: "exact", head: true }).eq("deal_id", dealId);
  if ((existing ?? 0) > 0) return NextResponse.json({ error: "This fee already has a payment plan." }, { status: 409 });

  // The fee is invoiced on close day, so it is almost always 'outstanding' when
  // a founder asks to spread it — and that invoice is LIVE, collecting the full
  // amount on 14-day terms. The plan's instalments will collect the same total
  // again unless the original is voided first. Void it, then plan; if it cannot
  // be voided (it was just paid, say), do not create a plan that would bill on
  // top of a paid fee.
  if (state === "outstanding" && deal.stripe_invoice_id) {
    const voided = await voidInvoice(deal.stripe_invoice_id);
    if (!voided) {
      return NextResponse.json({ error: "This fee's invoice couldn't be converted to a plan — it may have just been paid. Refresh and check." }, { status: 409 });
    }
    // The instalment loop now owns billing; the whole-fee invoice is gone. The
    // invoice.voided webhook will also set this, idempotently.
    await admin.from("deals").update({ fee_billing_status: "voided" }).eq("id", dealId);
  }

  // Amounts come from the stored fee, never from the request.
  const rows = planInstalments(Number(deal.success_fee_amount), term, new Date().toISOString())
    .map(i => ({ deal_id: dealId, seq: i.seq, amount: i.amount, due_date: i.dueDate }));
  if (rows.length === 0) return NextResponse.json({ error: "Could not build a schedule." }, { status: 500 });

  const { error } = await admin.from("fee_instalments").insert(rows);
  if (error) return NextResponse.json({ error: "Could not save the plan" }, { status: 500 });

  await admin.from("deals").update({
    fee_plan_months: rows.length,
    fee_plan_started_at: new Date().toISOString(),
  }).eq("id", dealId);

  const startup = deal.startup as unknown as { id: string; name: string } | null;
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").limit(20);
  const adminIds = (admins ?? []).map(a => a.id);
  if (adminIds.length) {
    await notifyUsers(adminIds, {
      type: "fee_due",
      title: `Fee plan started — ${startup?.name ?? "a deal"}`,
      body: `The success fee will be paid over ${rows.length} months.`,
      href: "/admin",
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, instalments: rows.map(({ seq, amount, due_date }) => ({ seq, amount, due_date, paid_at: null })) });
}

/**
 * The deal, only if this user's own listing owes the fee on it. Scoped here
 * rather than in the handlers so neither can forget: a payment schedule is
 * something you set on your own debt.
 */
async function ownFeeDeal(admin: ReturnType<typeof createAdminClient>, userId: string, dealId: string) {
  const { data: startup } = await admin.from("startups").select("id, name").eq("owner_id", userId).maybeSingle();
  if (!startup) return null;

  const { data: deal } = await admin
    .from("deals")
    .select("id, startup_id, success_fee_amount, success_fee_invoiced, success_fee_paid_at, stripe_invoice_id, fee_billing_status, fee_waived_at, fee_disputed_at, fee_dispute_resolved_at, fee_refunded_at, fee_chargeback_at, fee_chargeback_resolved_at, currency, startup:startups(id, name)")
    .eq("id", dealId)
    .maybeSingle();

  if (!deal || deal.startup_id !== startup.id) return null;
  if (deal.success_fee_amount == null) return null;
  return deal;
}
