import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { isTeamMemberOfEither } from "@/lib/membership";
import { notifyUsers } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * D37: post-close funding confirmation. Closing a deal raised the fee and
 * then the lifecycle simply stopped — nothing recorded whether the money
 * ever moved.
 *
 * Two one-way confirmations: the investor marks funds sent, the founder
 * marks funds received. When both are in, the deal is funded and both
 * sides are told. Each side can only confirm its own leg, and a
 * confirmation cannot be taken back — it is a statement of fact about
 * money, not a toggle.
 *
 * No bank details pass through here by design (see migration 073).
 *
 * POST { dealId, step: "sent" | "received", reference? }
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });

  const { dealId, step, reference } = await req.json().catch(() => ({}));
  if (!isUuid(dealId ?? "")) return NextResponse.json({ error: "dealId required" }, { status: 400 });
  if (step !== "sent" && step !== "received") return NextResponse.json({ error: "step must be sent or received" }, { status: 400 });
  const ref = typeof reference === "string" && reference.trim() ? reference.trim().slice(0, 120) : null;

  const admin = createAdminClient();
  const { data: deal } = await admin
    .from("deals")
    .select("id, status, amount, currency, startup_id, investor_id, funds_sent_at, funds_received_at, funded_at, startup:startups(name, owner_id), investor:investors(owner_id, display_name)")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  if (deal.status !== "closed") return NextResponse.json({ error: "Only a closed deal can be funded." }, { status: 409 });

  const startupOwner = (deal.startup as unknown as { owner_id: string } | null)?.owner_id ?? null;
  const investorOwner = (deal.investor as unknown as { owner_id: string | null } | null)?.owner_id ?? null;
  const isFounderSide = user.id === startupOwner;
  const isInvestorSide = !!investorOwner && user.id === investorOwner;
  const isTeam = await isTeamMemberOfEither(user.id, deal.startup_id, deal.investor_id);
  if (!isFounderSide && !isInvestorSide && !isTeam) {
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (prof?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Each side confirms only its own leg. The investor says money left; the
  // founder says money arrived. An off-platform investor has no account, so
  // the founder records both (they are the only party present).
  const externalInvestor = !investorOwner;
  // "Sent" is the investor's leg. The ONLY founder exception is an
  // off-platform investor with no account (the founder is the sole party).
  // The old trailing `&& !isFounderSide` made this unreachable for founders
  // on real deals, letting them confirm the investor's leg unilaterally.
  if (step === "sent" && !isInvestorSide && !(externalInvestor && isFounderSide)) {
    return NextResponse.json({ error: "Only the investor confirms funds sent." }, { status: 403 });
  }
  if (step === "received" && !isFounderSide) {
    return NextResponse.json({ error: "Only the founder confirms funds received." }, { status: 403 });
  }
  if (step === "sent" && deal.funds_sent_at) return NextResponse.json({ error: "Already confirmed." }, { status: 409 });
  if (step === "received" && deal.funds_received_at) return NextResponse.json({ error: "Already confirmed." }, { status: 409 });

  const now = new Date().toISOString();
  const patch: { funds_sent_at?: string; funds_sent_by?: string; funds_received_at?: string; funds_received_by?: string; funded_at?: string; funding_reference?: string } = {};
  if (step === "sent") { patch.funds_sent_at = now; patch.funds_sent_by = user.id; }
  else { patch.funds_received_at = now; patch.funds_received_by = user.id; }
  if (ref) patch.funding_reference = ref;

  const bothNow = step === "sent" ? !!deal.funds_received_at : !!deal.funds_sent_at;
  if (bothNow) patch.funded_at = now;

  const { error } = await admin.from("deals").update(patch).eq("id", dealId);
  if (error) return NextResponse.json({ error: "Could not record it" }, { status: 500 });

  await admin.from("deal_activity").insert({
    deal_id: dealId,
    startup_id: deal.startup_id,
    investor_id: deal.investor_id,
    actor_id: user.id,
    type: "note",
    body: step === "sent" ? `Funds sent${ref ? ` · ref ${ref}` : ""}` : `Funds received${ref ? ` · ref ${ref}` : ""}`,
  }).then(undefined, () => {});

  const recipients = [startupOwner, investorOwner].filter((id): id is string => !!id && id !== user.id);
  if (recipients.length) {
    await notifyUsers(recipients, {
      type: "deal_closed",
      title: bothNow
        ? `Funded — ${(deal.startup as unknown as { name: string } | null)?.name ?? "your deal"}`
        : step === "sent" ? "The investor confirmed funds sent" : "The founder confirmed funds received",
      body: bothNow ? "Both sides confirmed the transfer." : "Confirm your side to complete the round.",
      href: `/deals?deal=${dealId}`,
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, fundsSentAt: patch.funds_sent_at ?? deal.funds_sent_at, fundsReceivedAt: patch.funds_received_at ?? deal.funds_received_at, fundedAt: patch.funded_at ?? deal.funded_at });
}
