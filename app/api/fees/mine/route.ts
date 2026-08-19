import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { notifyUsers } from "@/lib/notify-user";
import { feeState, feeMajor, type FeeDeal } from "@/lib/fees";
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
 * GET  — every fee raised against this founder's listing.
 * POST — { dealId, reason } opens a dispute, which pauses dunning.
 */

const COLUMNS = "id, amount, currency, closed_at, success_fee_amount, success_fee_invoiced, success_fee_paid_at, stripe_invoice_id, fee_billing_status, fee_reminder_count, fee_waived_at, fee_disputed_at, fee_dispute_reason, fee_dispute_resolved_at, fee_dispute_resolution, investor:investors(display_name, firm_name, is_external)";

async function myStartup(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("startups").select("id, name").eq("owner_id", userId).maybeSingle();
  return { admin, startup: data };
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { admin, startup } = await myStartup(user.id);
  if (!startup) return NextResponse.json({ fees: [] });

  const { data } = await admin
    .from("deals")
    .select(COLUMNS)
    .eq("startup_id", startup.id)
    .not("success_fee_amount", "is", null)
    .order("closed_at", { ascending: false })
    .limit(100);

  const fees = (data ?? []).map(d => {
    const inv = d.investor as unknown as { display_name: string | null; firm_name: string | null } | null;
    return {
      id: d.id,
      amount: d.amount,
      currency: d.currency,
      closedAt: d.closed_at,
      feeMajor: feeMajor(d as unknown as FeeDeal),
      state: feeState(d as unknown as FeeDeal),
      investorName: inv?.firm_name || inv?.display_name || null,
      disputeReason: d.fee_dispute_reason,
      disputeResolution: d.fee_dispute_resolution,
      resolvedAt: d.fee_dispute_resolved_at,
    };
  }).filter(f => f.state !== "none");

  return NextResponse.json({ fees });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dealId, reason } = await req.json().catch(() => ({}));
  if (!isUuid(dealId ?? "")) return NextResponse.json({ error: "dealId required" }, { status: 400 });
  const why = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 1000) : null;
  if (!why) return NextResponse.json({ error: "Tell us what is wrong with the amount." }, { status: 400 });

  const { admin, startup } = await myStartup(user.id);
  if (!startup) return NextResponse.json({ error: "You have no listing." }, { status: 403 });

  const { data: deal } = await admin.from("deals").select("startup_id, investor_id, id, amount, currency, closed_at, success_fee_amount, success_fee_invoiced, success_fee_paid_at, fee_billing_status, fee_waived_at, fee_disputed_at, fee_dispute_resolved_at").eq("id", dealId).maybeSingle();
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

  return NextResponse.json({ success: true, state: "disputed" });
}
