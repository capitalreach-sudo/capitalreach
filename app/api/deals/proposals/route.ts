import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity } from "@/lib/membership";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * Deal proposals: the consent step in front of every deal (migration 091).
 *
 * GET   — my proposals, incoming and outgoing.
 * PATCH { id, action: "accept" | "decline" | "withdraw" }
 *
 * Two rules do the work here:
 *  - Only the RECIPIENT side may accept or decline, and only the PROPOSER may
 *    withdraw. Which side the caller is on is resolved from ownership, never
 *    trusted from the request.
 *  - Accepting re-checks the world before creating anything: the round may
 *    have closed and a deal may have appeared through another path since the
 *    proposal was sent. A stale yes must not create a deal the checks at
 *    proposal time would have refused.
 */

type Sides = { startupSide: boolean; investorSide: boolean; startupId: string | null; investorId: string | null };

async function mySides(userId: string): Promise<Sides> {
  const [st, inv] = await Promise.all([
    resolveEntity(userId, "startup"),
    resolveEntity(userId, "investor"),
  ]);
  return {
    startupSide: !!st, investorSide: !!inv,
    startupId: st?.entityId ?? null, investorId: inv?.entityId ?? null,
  };
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const sides = await mySides(user.id);
  if (!sides.startupId && !sides.investorId) return NextResponse.json({ incoming: [], outgoing: [] });

  const filters: string[] = [];
  if (sides.startupId) filters.push(`startup_id.eq.${sides.startupId}`);
  if (sides.investorId) filters.push(`investor_id.eq.${sides.investorId}`);

  const { data } = await admin
    .from("deal_proposals")
    .select("id, startup_id, investor_id, from_side, status, amount, currency, opening_status, note, created_at, startup:startups(name, slug, logo_url, logo_color), investor:investors(display_name, firm_name, slug, logo_url, logo_color)")
    .or(filters.join(","))
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []).map(p => {
    const st = p.startup as unknown as { name: string; slug: string; logo_url: string | null; logo_color: string | null } | null;
    const inv = p.investor as unknown as { display_name: string | null; firm_name: string | null; slug: string; logo_url: string | null; logo_color: string | null } | null;
    // Incoming = the OTHER side proposed it to an entity I own.
    const mine = p.from_side === "startup" ? p.startup_id === sides.startupId : p.investor_id === sides.investorId;
    return {
      id: p.id,
      direction: mine ? "outgoing" : "incoming",
      fromSide: p.from_side,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      openingStatus: p.opening_status,
      note: p.note,
      createdAt: p.created_at,
      counterpart: p.from_side === "startup"
        ? (mine ? { kind: "investor", name: inv?.firm_name || inv?.display_name || "Investor", logoUrl: inv?.logo_url ?? null, logoColor: inv?.logo_color ?? null }
                : { kind: "startup", name: st?.name ?? "Startup", slug: st?.slug, logoUrl: st?.logo_url ?? null, logoColor: st?.logo_color ?? null })
        : (mine ? { kind: "startup", name: st?.name ?? "Startup", slug: st?.slug, logoUrl: st?.logo_url ?? null, logoColor: st?.logo_color ?? null }
                : { kind: "investor", name: inv?.firm_name || inv?.display_name || "Investor", logoUrl: inv?.logo_url ?? null, logoColor: inv?.logo_color ?? null }),
    };
  });

  return NextResponse.json({
    incoming: rows.filter(r => r.direction === "incoming"),
    outgoing: rows.filter(r => r.direction === "outgoing"),
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });

  const { id, action } = await req.json().catch(() => ({}));
  if (!isUuid(id ?? "")) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!["accept", "decline", "withdraw"].includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const admin = createAdminClient();
  const { data: p } = await admin.from("deal_proposals").select("*").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (p.status !== "pending") return NextResponse.json({ error: "This request was already answered." }, { status: 409 });

  const sides = await mySides(user.id);
  const iAmStartupParty = sides.startupId === p.startup_id;
  const iAmInvestorParty = sides.investorId === p.investor_id;
  if (!iAmStartupParty && !iAmInvestorParty) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const iAmProposerSide = p.from_side === "startup" ? iAmStartupParty : iAmInvestorParty;

  if (action === "withdraw") {
    if (!iAmProposerSide) return NextResponse.json({ error: "Only the sender can withdraw a request." }, { status: 403 });
    await admin.from("deal_proposals").update({ status: "withdrawn", resolved_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ success: true, status: "withdrawn" });
  }

  // accept / decline: recipient only. The proposer answering their own
  // request is the unilateral deal this table exists to prevent.
  if (iAmProposerSide) return NextResponse.json({ error: "The other side has to answer this one." }, { status: 403 });

  if (action === "decline") {
    await admin.from("deal_proposals").update({ status: "declined", resolved_at: new Date().toISOString() }).eq("id", id);
    await notifyResolution(admin, p, user.id, false);
    return NextResponse.json({ success: true, status: "declined" });
  }

  // ── Accept ──────────────────────────────────────────────────────────────
  // Re-check the world. Time has passed since the proposal; a stale yes must
  // not create a deal the proposal-time checks would have refused.
  const { data: st } = await admin
    .from("startups").select("id, status, round_state").eq("id", p.startup_id).maybeSingle();
  if (!st || st.status !== "active") {
    return NextResponse.json({ error: "That listing is no longer live." }, { status: 409 });
  }
  if (p.from_side === "investor" && (st.round_state === "closed" || st.round_state === "paused")) {
    return NextResponse.json({ error: "The round is no longer open to new investors." }, { status: 409 });
  }

  const { data: existing } = await admin
    .from("deals").select("id")
    .eq("startup_id", p.startup_id).eq("investor_id", p.investor_id)
    .not("status", "in", "(closed,passed)")
    .limit(1).maybeSingle();
  if (existing) {
    await admin.from("deal_proposals").update({ status: "accepted", resolved_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ error: "A deal with this partner already exists." }, { status: 409 });
  }

  const { data: deal, error } = await admin
    .from("deals")
    .insert({
      startup_id: p.startup_id,
      investor_id: p.investor_id,
      amount: p.amount,
      currency: p.currency ?? undefined,
      status: p.opening_status,
      next_follow_up: p.next_follow_up ?? undefined,
      circumvention_ack_id: p.circumvention_ack_id,
    })
    .select()
    .single();
  if (error || !deal) {
    if (error?.code === "23505") return NextResponse.json({ error: "A deal with this partner already exists." }, { status: 409 });
    return NextResponse.json({ error: "Failed to create the deal" }, { status: 500 });
  }

  await admin.from("deal_proposals").update({ status: "accepted", resolved_at: new Date().toISOString() }).eq("id", id);

  // Seed the timeline the way a direct create would have: the proposer's
  // opening note (their words, attributed to them), then the acceptance.
  if (p.note) {
    await admin.from("deal_activity").insert({
      deal_id: deal.id, startup_id: p.startup_id, investor_id: p.investor_id,
      actor_id: p.proposed_by, type: "note", body: p.note,
    }).then(undefined, () => {});
  }
  await admin.from("deal_activity").insert({
    deal_id: deal.id, startup_id: p.startup_id, investor_id: p.investor_id,
    actor_id: user.id, type: "status_change", body: null,
  }).then(undefined, () => {});

  await notifyResolution(admin, p, user.id, true, deal.id);

  return NextResponse.json({ success: true, status: "accepted", deal });
}

/** Tells the proposer how it went. A request that vanishes teaches people not to send the next one. */
async function notifyResolution(
  admin: ReturnType<typeof createAdminClient>,
  p: { startup_id: string; investor_id: string; from_side: string; proposed_by: string },
  actorId: string,
  accepted: boolean,
  dealId?: string,
) {
  try {
    const [{ data: st }, { data: inv }] = await Promise.all([
      admin.from("startups").select("name").eq("id", p.startup_id).maybeSingle(),
      admin.from("investors").select("display_name, firm_name").eq("id", p.investor_id).maybeSingle(),
    ]);
    const accepterName = p.from_side === "investor"
      ? (st?.name ?? "The startup")
      : (inv?.firm_name || inv?.display_name || "The investor");
    if (p.proposed_by === actorId) return;
    await notifyUser({
      userId: p.proposed_by,
      type: accepted ? "deal_opened" : "deal_passed",
      title: accepted ? `${accepterName} accepted — the deal is open` : `${accepterName} declined your request`,
      body: accepted ? "It is on both pipelines now." : "No hard feelings — they may not be a fit right now.",
      href: accepted && dealId ? `/deals?deal=${dealId}` : "/deals",
    });
  } catch { /* a lost notification must not fail the action */ }
}
