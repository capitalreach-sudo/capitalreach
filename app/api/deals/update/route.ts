import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { isCurrencyCode } from "@/lib/currency";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A suspended account must not be able to write. The RESTRICTIVE policies in
  // 017 don't cover this route because the write goes through the service role.
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }


  const { dealId, status, reason, nextFollowUp, amount, currency } = await req.json();

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  // Verify participant (or admin, who can manage any deal for oversight)
  const { data: deal } = await supabase
    .from("deals")
    .select("startup_id, investor_id, startup:startups(owner_id), investor:investors(owner_id)")
    .eq("id", dealId)
    .single();

  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isParticipant =
    (deal.startup as any)?.owner_id === user.id ||
    (deal.investor as any)?.owner_id === user.id;

  if (!isParticipant && profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Use close endpoint for closed status (triggers invoice)
  if (status === "closed") {
    return NextResponse.json({ error: "Use /api/deals/close for closing deals" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (status) {
    updates.status = status;
    // Only a genuine stage move resets the clock. updated_at can't stand in for
    // this -- notes and contracts bump that without the stage changing, so a
    // deal stuck in Diligence for months looks freshly touched.
    updates.stage_entered_at = new Date().toISOString();
  }
  if (nextFollowUp !== undefined) updates.next_follow_up = nextFollowUp;

  // passed_at, like closed_at, existed since 017 and was never written. Without
  // it there is no way to tell a deal that died last week from one that died
  // last year -- both just read "passed".
  if (status === "passed") updates.passed_at = new Date().toISOString();

  // Reopening. A passed deal could previously never come back, but "they
  // re-engaged in Q3" is an ordinary thing to happen. Clearing passed_at keeps
  // the column meaning "when this deal died", not "when it last died".
  if (status && status !== "passed") updates.passed_at = null;

  // Rounds resize mid-negotiation. The amount was previously fixed at creation
  // and only changeable by closing, which forced people to close at a number
  // they knew was wrong.
  if (typeof amount === "number" && amount > 0) updates.amount = Math.round(amount);
  if (amount === null) updates.amount = null;
  if (typeof currency === "string" && isCurrencyCode(currency)) updates.currency = currency;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("deals").update(updates).eq("id", dealId);

    // Deploy-order guard, and deliberately temporary. stage_entered_at arrives
    // in migration 020; if this code reaches an environment where that has not
    // been applied yet, the whole statement is rejected and moving a deal
    // between stages -- the core interaction of this product -- would fail.
    // Retry without the new column so the stage change still lands, and only
    // the aging figure is missing until the migration runs.
    //
    // PGRST204 is the code that actually occurs: PostgREST validates the
    // payload against its own schema cache and refuses before Postgres sees
    // the statement, so 42703 never surfaces. Both are matched because a
    // stale-but-present cache can produce the Postgres code instead.
    //
    // Delete this branch once 020 is applied everywhere.
    if ((error?.code === "PGRST204" || error?.code === "42703") && "stage_entered_at" in updates) {
      const { stage_entered_at: _dropped, ...withoutNewColumn } = updates;
      console.warn("[deals/update] stage_entered_at missing — apply migration 020");
      await supabase.from("deals").update(withoutNewColumn).eq("id", dealId);
    } else if (error) {
      return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
    }
  }

  if (status) {
    // deal_activity has no admin RLS policy (unlike deals), so use the admin
    // client here to make sure admin-initiated changes still get logged.
    const admin = createAdminClient();
    await admin.from("deal_activity").insert({
      deal_id: dealId,
      startup_id: deal.startup_id,
      investor_id: deal.investor_id,
      actor_id: user.id,
      type: "status_change",
      body: status === "passed" && typeof reason === "string" && reason.trim() ? reason.trim() : null,
    });
  }

  return NextResponse.json({ success: true });
}
