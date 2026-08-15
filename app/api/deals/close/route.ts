import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isTeamMemberOfEither } from "@/lib/membership";
import { createSuccessFeeInvoice } from "@/lib/stripe";
import { sendDealClosedEmail } from "@/lib/resend";
import { isCurrencyCode, DEFAULT_CURRENCY } from "@/lib/currency";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { notifyUsers } from "@/lib/notify-user";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A suspended account must not be able to write. The RESTRICTIVE policies in
  // 017 don't cover this route because the write goes through the service role.
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }


  const body = await req.json().catch(() => ({}));
  const { dealId, amount, currency } = body;
  const dealCurrency = isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY;

  // Amount is optional (fall back to the deal's stored amount below), but when
  // supplied it drives a real Stripe invoice against the founder — so it must
  // be a sane, bounded number, never a caller-supplied string like "9999999".
  let parsedAmount: number | null = null;
  if (amount !== undefined && amount !== null && amount !== "") {
    const n = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000_000) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    parsedAmount = n;
  }

  const adminClient = createAdminClient();

  const { data: deal } = await adminClient
    .from("deals")
    .select("*, startup:startups(name, owner_id), investor:investors(owner_id)")
    .eq("id", dealId)
    .single();

  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  // Verify user is a participant (or admin, who can manage any deal for oversight)
  const isStartupOwner = deal.startup?.owner_id === user.id;
  const isInvestorOwner = deal.investor?.owner_id === user.id;
  if (!isStartupOwner && !isInvestorOwner) {
    // Team members may close too -- the Team page promises members can "work
    // the account's deals", and the fee below is unaffected by who clicks:
    // the invoice always targets the startup owner's Stripe customer.
    const isMember = await isTeamMemberOfEither(user.id, deal.startup_id, deal.investor_id);
    if (!isMember) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Get startup owner's Stripe customer ID
  const { data: startupProfile } = await adminClient
    .from("profiles")
    .select("email, full_name, stripe_customer_id")
    .eq("id", deal.startup?.owner_id)
    .single();

  const { data: investorProfile } = await adminClient
    .from("profiles")
    .select("email, full_name")
    .eq("id", deal.investor?.owner_id)
    .single();

  // Mark deal as closed.
  //
  // The `.neq("status", "closed")` is the idempotency gate, and it has to live
  // in the UPDATE rather than in an if-statement above it. Closing raises a
  // success-fee invoice, so a double-submit -- an impatient second click, a
  // retried request -- previously billed the founder twice. Two concurrent
  // requests both read the deal as open; only one can win this statement,
  // because the loser re-evaluates the qualifier after the row lock clears and
  // matches nothing. The invoice below only runs for the winner.
  const finalAmount = parsedAmount ?? deal.amount;

  const { data: closedRows } = await adminClient
    .from("deals")
    .update({
      status: "closed",
      amount: finalAmount,
      currency: dealCurrency,
      // closed_at has existed since 017 and nothing ever wrote it, so no deal
      // in production carried a close date. That is not a gap you can backfill
      // later -- the moment passes and the timestamp is gone -- and without it
      // there is no time-to-close, no "closed this quarter", no cohort view.
      closed_at: new Date().toISOString(),
      // Closing is a stage move like any other, so the aging clock resets.
      stage_entered_at: new Date().toISOString(),
      // Likewise the fee: it was computed inside Stripe and never stored, so
      // answering "how much have we billed?" meant querying Stripe rather than
      // our own database. Recorded in minor units to match Stripe.
      success_fee_amount: finalAmount ? Math.round(finalAmount * 0.02 * 100) : null,
    })
    .eq("id", dealId)
    .neq("status", "closed")
    .select("id");

  if (!closedRows || closedRows.length === 0) {
    return NextResponse.json({ success: true, alreadyClosed: true, invoiceUrl: "" });
  }

  await adminClient.from("deal_activity").insert({
    deal_id: dealId,
    startup_id: deal.startup_id,
    investor_id: deal.investor_id,
    actor_id: user.id,
    type: "status_change",
    body: null,
  });

  let invoiceUrl = "";
  // A fee is due but cannot be billed if the founder never set up Stripe.
  const feeNotBilled = !!finalAmount && finalAmount > 0 && !deal.success_fee_invoiced && !startupProfile?.stripe_customer_id;
  // Create success fee invoice if we have a customer ID and amount
  if (startupProfile?.stripe_customer_id && finalAmount && finalAmount > 0 && !deal.success_fee_invoiced) {
    try {
      const invoice = await createSuccessFeeInvoice(
        startupProfile.stripe_customer_id,
        finalAmount,
        deal.startup?.name ?? "Startup",
        dealCurrency,
        dealId
      );
      await adminClient
        .from("deals")
        .update({ success_fee_invoiced: true, stripe_invoice_id: invoice.id })
        .eq("id", dealId);
      invoiceUrl = invoice.hosted_invoice_url || "";

      // The invoice is the only event on this timeline where money moves, and
      // it was the one event the timeline didn't record. Both participants can
      // now see what was billed and when, without going to Stripe.
      await adminClient.from("deal_activity").insert({
        deal_id: dealId,
        startup_id: deal.startup_id,
        investor_id: deal.investor_id,
        actor_id: user.id,
        type: "success_fee",
        body: `${dealCurrency} ${(finalAmount * 0.02).toLocaleString()}`,
      }).then(undefined, () => {});
    } catch (err) {
      console.error("Failed to create success fee invoice:", err);
    }
  }

  // Both sides, including whoever pressed the button -- a closed round is worth
  // seeing confirmed rather than assumed.
  await notifyUsers([deal.startup?.owner_id, deal.investor?.owner_id], {
    type:  "deal_closed",
    title: `Deal closed — ${deal.startup?.name ?? "a startup"}`,
    body:  finalAmount ? `${dealCurrency} ${finalAmount.toLocaleString()}${feeNotBilled ? "" : " · 2% success fee invoiced"}` : null,
    href:  `/deals?deal=${dealId}`,
  });

  // Send congratulations emails
  if (startupProfile && investorProfile) {
    await sendDealClosedEmail(
      startupProfile.email,
      investorProfile.email,
      deal.startup?.name ?? "Startup",
      investorProfile.full_name || "the investor",
      finalAmount || 0,
      invoiceUrl,
      dealCurrency
    ).catch(() => {});
  }

  return NextResponse.json({ success: true, invoiceUrl, feeNotBilled });
}
