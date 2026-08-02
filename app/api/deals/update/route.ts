import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isTeamMemberOfEither } from "@/lib/membership";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { isCurrencyCode } from "@/lib/currency";
import { notifyUsers } from "@/lib/notify-user";

// Human-readable stage names for notification copy. Kept here rather than
// imported from the kanban because that is a client component and this is a
// route handler.
const STAGE_LABEL: Record<string, string> = {
  intro:         "Intro",
  due_diligence: "Due Diligence",
  term_sheet:    "Term Sheet",
  passed:        "Passed",
};

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
    (deal.investor as any)?.owner_id === user.id ||
    await isTeamMemberOfEither(user.id, deal.startup_id, deal.investor_id);

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
    if (error) {
      console.error("[deals/update]", error);
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

    // Tell the other side. A deal moving stage -- especially to passed -- is
    // the thing a counterparty most wants to hear about and previously the
    // thing they were least likely to notice.
    const other = [
      (deal.startup as any)?.owner_id,
      (deal.investor as any)?.owner_id,
    ].filter((id) => id && id !== user.id);

    const label = STAGE_LABEL[status as string] ?? status;
    await notifyUsers(other, {
      type:  status === "passed" ? "deal_passed" : "deal_stage",
      title: status === "passed" ? "A deal was marked passed" : `A deal moved to ${label}`,
      body:  status === "passed" && typeof reason === "string" && reason.trim() ? reason.trim() : null,
      href:  "/deals",
    });
  }

  return NextResponse.json({ success: true });
}
