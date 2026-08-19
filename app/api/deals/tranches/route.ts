import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { notifyUsers } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";
import { scheduleTotal, scheduleReconciles, allReceived } from "@/lib/tranches";

/**
 * D39: tranched funding.
 *
 * A commitment is often paid in instalments — half on close, half on a
 * milestone — and until now the platform could only record one transfer.
 * Founders tracked the rest in a spreadsheet and the raise tracker counted
 * money that had not arrived.
 *
 * Two operations:
 *   POST { dealId, action: "save", tranches: [{ label?, amount, dueDate?, condition? }] }
 *   POST { dealId, action: "confirm", trancheId, step: "sent" | "received", reference? }
 *
 * The schedule must add up to the deal amount exactly. A schedule that does
 * not reconcile is worse than no schedule: it silently changes what the deal
 * is worth. Tranches that have already been confirmed cannot be rewritten —
 * a confirmation is a statement about money that moved.
 *
 * As in 073, each side confirms only its own leg and no bank details pass
 * through here.
 */

/** GET ?dealId= — the schedule, gated by the caller's access to the deal. */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealId = req.nextUrl.searchParams.get("dealId") ?? "";
  if (!isUuid(dealId)) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: deal } = await admin
    .from("deals")
    .select("id, startup:startups(owner_id), investor:investors(owner_id)")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  const startupOwner = (deal.startup as unknown as { owner_id: string } | null)?.owner_id ?? null;
  const investorOwner = (deal.investor as unknown as { owner_id: string | null } | null)?.owner_id ?? null;
  if (user.id !== startupOwner && user.id !== investorOwner) {
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (prof?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data } = await admin.from("deal_tranches").select("*").eq("deal_id", dealId).order("position");
  return NextResponse.json({ tranches: data ?? [] });
}

type Party = { startupOwner: string | null; investorOwner: string | null; isFounder: boolean; isInvestor: boolean; isAdmin: boolean };

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { dealId, action } = body ?? {};
  if (!isUuid(dealId ?? "")) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: deal } = await admin
    .from("deals")
    .select("id, status, amount, currency, startup_id, investor_id, funded_at, startup:startups(name, owner_id), investor:investors(owner_id, display_name)")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const startupOwner = (deal.startup as unknown as { owner_id: string } | null)?.owner_id ?? null;
  const investorOwner = (deal.investor as unknown as { owner_id: string | null } | null)?.owner_id ?? null;
  let isAdmin = false;
  if (user.id !== startupOwner && user.id !== investorOwner) {
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    isAdmin = prof?.role === "admin";
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const party: Party = {
    startupOwner, investorOwner,
    isFounder: user.id === startupOwner,
    isInvestor: !!investorOwner && user.id === investorOwner,
    isAdmin,
  };

  if (action === "save") return saveSchedule(body, deal, party, user.id, admin);
  if (action === "confirm") return confirmTranche(body, deal, party, user.id, admin);
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

type DealRow = { id: string; status: string; amount: number | null; currency: string | null; startup_id: string; investor_id: string; funded_at: string | null; startup: unknown; investor: unknown };
type Admin = ReturnType<typeof createAdminClient>;

async function saveSchedule(body: Record<string, unknown>, deal: DealRow, party: Party, userId: string, admin: Admin) {
  if (deal.status !== "term_sheet" && deal.status !== "closed") {
    return NextResponse.json({ error: "A schedule can only be set once the deal reaches term sheet." }, { status: 409 });
  }
  const raw = Array.isArray(body.tranches) ? body.tranches : null;
  if (!raw) return NextResponse.json({ error: "tranches required" }, { status: 400 });
  if (raw.length > 12) return NextResponse.json({ error: "At most 12 tranches." }, { status: 400 });

  const rows = raw.map((r, i) => {
    const t = r as Record<string, unknown>;
    const amount = Number(t.amount);
    return {
      deal_id: deal.id,
      position: i,
      label: typeof t.label === "string" && t.label.trim() ? t.label.trim().slice(0, 80) : null,
      amount,
      due_date: typeof t.dueDate === "string" && t.dueDate ? t.dueDate.slice(0, 10) : null,
      condition: typeof t.condition === "string" && t.condition.trim() ? t.condition.trim().slice(0, 200) : null,
    };
  });
  if (rows.some(r => !Number.isFinite(r.amount) || r.amount <= 0)) {
    return NextResponse.json({ error: "Every tranche needs an amount above zero." }, { status: 400 });
  }

  // The schedule must reconcile with the deal. Rounded to cents so that
  // three-way splits of an odd amount are not rejected for a floating-point
  // remainder, but a genuine mismatch still is.
  const total = scheduleTotal(rows.map(r => r.amount));
  if (!scheduleReconciles(rows.map(r => r.amount), deal.amount)) {
    const target = Number(deal.amount);
    return NextResponse.json({ error: `The schedule totals ${total.toLocaleString()} but the deal is ${target.toLocaleString()}.`, total, target }, { status: 400 });
  }

  const { data: existing } = await admin.from("deal_tranches").select("id, funds_sent_at, funds_received_at").eq("deal_id", deal.id);
  if ((existing ?? []).some(t => t.funds_sent_at || t.funds_received_at)) {
    return NextResponse.json({ error: "Part of this schedule is already confirmed and cannot be rewritten." }, { status: 409 });
  }

  const { error: delErr } = await admin.from("deal_tranches").delete().eq("deal_id", deal.id);
  if (delErr) return NextResponse.json({ error: "Could not save the schedule" }, { status: 500 });
  if (rows.length) {
    const { error } = await admin.from("deal_tranches").insert(rows);
    if (error) return NextResponse.json({ error: "Could not save the schedule" }, { status: 500 });
  }

  await admin.from("deal_activity").insert({
    deal_id: deal.id, startup_id: deal.startup_id, investor_id: deal.investor_id, actor_id: userId,
    type: "note",
    body: rows.length ? `Funding schedule set — ${rows.length} tranches` : "Funding schedule cleared",
  }).then(undefined, () => {});

  const others = [party.startupOwner, party.investorOwner].filter((id): id is string => !!id && id !== userId);
  if (others.length && rows.length) {
    await notifyUsers(others, {
      type: "deal_closed",
      title: "A funding schedule was proposed",
      body: `${rows.length} tranches on ${(deal.startup as unknown as { name: string } | null)?.name ?? "your deal"}.`,
      href: `/deals?deal=${deal.id}`,
    }).catch(() => {});
  }

  const { data: saved } = await admin.from("deal_tranches").select("*").eq("deal_id", deal.id).order("position");
  return NextResponse.json({ success: true, tranches: saved ?? [] });
}

async function confirmTranche(body: Record<string, unknown>, deal: DealRow, party: Party, userId: string, admin: Admin) {
  const trancheId = body.trancheId;
  const step = body.step;
  if (!isUuid(typeof trancheId === "string" ? trancheId : "")) return NextResponse.json({ error: "trancheId required" }, { status: 400 });
  if (step !== "sent" && step !== "received") return NextResponse.json({ error: "step must be sent or received" }, { status: 400 });
  const reference = body.reference;
  const ref = typeof reference === "string" && reference.trim() ? reference.trim().slice(0, 120) : null;

  const { data: tranche } = await admin.from("deal_tranches").select("*").eq("id", trancheId as string).maybeSingle();
  if (!tranche || tranche.deal_id !== deal.id) return NextResponse.json({ error: "Tranche not found" }, { status: 404 });

  // An off-platform investor has no account, so the founder records both legs
  // — they are the only party present.
  const externalInvestor = !party.investorOwner;
  if (step === "sent" && !party.isInvestor && !(externalInvestor && party.isFounder) && !party.isAdmin) {
    return NextResponse.json({ error: "Only the investor confirms funds sent." }, { status: 403 });
  }
  if (step === "received" && !party.isFounder && !party.isAdmin) {
    return NextResponse.json({ error: "Only the founder confirms funds received." }, { status: 403 });
  }
  if (step === "sent" && tranche.funds_sent_at) return NextResponse.json({ error: "Already confirmed." }, { status: 409 });
  if (step === "received" && tranche.funds_received_at) return NextResponse.json({ error: "Already confirmed." }, { status: 409 });

  const now = new Date().toISOString();
  const patch: { funds_sent_at?: string; funds_sent_by?: string; funds_received_at?: string; funds_received_by?: string; reference?: string } = {};
  if (step === "sent") { patch.funds_sent_at = now; patch.funds_sent_by = userId; }
  else { patch.funds_received_at = now; patch.funds_received_by = userId; }
  if (ref) patch.reference = ref;

  const { error } = await admin.from("deal_tranches").update(patch).eq("id", tranche.id);
  if (error) return NextResponse.json({ error: "Could not record it" }, { status: 500 });

  // The deal is funded when every tranche has landed, not when the first has.
  const { data: all } = await admin.from("deal_tranches").select("id, amount, funds_received_at").eq("deal_id", deal.id);
  const list = all ?? [];
  const complete = allReceived(list);
  let fundedAt = deal.funded_at;
  if (complete && !deal.funded_at) {
    fundedAt = now;
    await admin.from("deals").update({ funded_at: now, funds_received_at: now, funds_received_by: userId }).eq("id", deal.id);
  }

  const label = tranche.label || `Tranche ${(tranche.position ?? 0) + 1}`;
  await admin.from("deal_activity").insert({
    deal_id: deal.id, startup_id: deal.startup_id, investor_id: deal.investor_id, actor_id: userId,
    type: "note",
    body: `${label}: funds ${step}${ref ? ` · ref ${ref}` : ""}`,
  }).then(undefined, () => {});

  const others = [party.startupOwner, party.investorOwner].filter((id): id is string => !!id && id !== userId);
  if (others.length) {
    await notifyUsers(others, {
      type: "deal_closed",
      title: complete
        ? `Fully funded — ${(deal.startup as unknown as { name: string } | null)?.name ?? "your deal"}`
        : step === "sent" ? `${label}: the investor confirmed funds sent` : `${label}: the founder confirmed funds received`,
      body: complete ? "Every tranche has been received." : "Confirm your side to complete this tranche.",
      href: `/deals?deal=${deal.id}`,
    }).catch(() => {});
  }

  const receivedTotal = list.filter(t => t.funds_received_at).reduce((s, t) => s + Number(t.amount || 0), 0);
  return NextResponse.json({ success: true, tranche: { ...tranche, ...patch }, fundedAt, receivedTotal });
}
