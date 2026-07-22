import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { createSuccessFeeInvoice } from "@/lib/stripe";
import { sendDealClosedEmail } from "@/lib/resend";
import { isCurrencyCode, DEFAULT_CURRENCY } from "@/lib/currency";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dealId, amount, currency } = await req.json();
  const dealCurrency = isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY;

  const adminClient = createAdminClient();

  const { data: deal } = await adminClient
    .from("deals")
    .select("*, startup:startups(name, owner_id), investor:investors(owner_id)")
    .eq("id", dealId)
    .single();

  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  // Verify user is a participant
  const isStartupOwner = deal.startup?.owner_id === user.id;
  const isInvestorOwner = deal.investor?.owner_id === user.id;
  if (!isStartupOwner && !isInvestorOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get startup owner's Stripe customer ID
  const { data: startupProfile } = await adminClient
    .from("profiles")
    .select("email, full_name, stripe_customer_id")
    .eq("id", deal.startup.owner_id)
    .single();

  const { data: investorProfile } = await adminClient
    .from("profiles")
    .select("email, full_name")
    .eq("id", deal.investor.owner_id)
    .single();

  // Mark deal as closed
  await adminClient
    .from("deals")
    .update({ status: "closed", amount: amount || deal.amount, currency: dealCurrency })
    .eq("id", dealId);

  let invoiceUrl = "";
  // Create success fee invoice if we have a customer ID and amount
  if (startupProfile?.stripe_customer_id && amount > 0) {
    try {
      const invoice = await createSuccessFeeInvoice(
        startupProfile.stripe_customer_id,
        amount,
        deal.startup.name,
        dealCurrency
      );
      await adminClient
        .from("deals")
        .update({ success_fee_invoiced: true, stripe_invoice_id: invoice.id })
        .eq("id", dealId);
      invoiceUrl = invoice.hosted_invoice_url || "";
    } catch (err) {
      console.error("Failed to create success fee invoice:", err);
    }
  }

  // Send congratulations emails
  if (startupProfile && investorProfile) {
    await sendDealClosedEmail(
      startupProfile.email,
      investorProfile.email,
      deal.startup.name,
      investorProfile.full_name || "the investor",
      amount || 0,
      invoiceUrl
    ).catch(() => {});
  }

  return NextResponse.json({ success: true, invoiceUrl });
}
