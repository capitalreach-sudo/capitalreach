import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isTeamMemberOfEither } from "@/lib/membership";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { isCurrencyCode } from "@/lib/currency";
import { notifyUsers } from "@/lib/notify-user";
import { maskIp } from "@/lib/identity";

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


  const { dealId, status, reason, nextFollowUp, amount, currency, commitmentType } = await req.json().catch(() => ({}));

  // B17: commitment level. Either party may record it (the investor says
  // "we're in for 50k", the founder logs a verbal yes from a call); the
  // timeline shows who set it.
  const COMMITMENTS = ["interest", "soft_circle", "verbal", "committed"] as const;
  if (commitmentType !== undefined && !COMMITMENTS.includes(commitmentType)) {
    return NextResponse.json({ error: "Invalid commitment type" }, { status: 400 });
  }

  // Statuses the UI can actually render. "closed" is handled by /api/deals/close
  // and rejected below; everything else must be one of these.
  const VALID_STATUSES = ["intro", "due_diligence", "term_sheet", "passed"];
  if (status !== undefined && !VALID_STATUSES.includes(status) && status !== "closed") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (nextFollowUp !== undefined && nextFollowUp !== null && !/^\d{4}-\d{2}-\d{2}$/.test(nextFollowUp)) {
    return NextResponse.json({ error: "Invalid follow-up date" }, { status: 400 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  // Verify participant (or admin, who can manage any deal for oversight)
  const { data: deal } = await supabase
    .from("deals")
    .select("startup_id, investor_id, status, startup:startups(owner_id), investor:investors(owner_id)")
    .eq("id", dealId)
    .single();

  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isParticipant =
    deal.startup?.owner_id === user.id ||
    deal.investor?.owner_id === user.id ||
    await isTeamMemberOfEither(user.id, deal.startup_id, deal.investor_id);

  if (!isParticipant && profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // A deal is a PROCESS: Talking → Negotiation → Final proposal, one step
  // at a time (either direction — negotiations do regress). Passing is
  // allowed from anywhere; Finalised is never set here at all — closing has
  // its own two-party route with the contract gate. Skipping stages made
  // the pipeline stats lie, so the ladder is enforced where writes happen.
  if (status !== undefined && status !== deal.status) {
    const LADDER = ["intro", "due_diligence", "term_sheet"] as const;
    const from = LADDER.indexOf(deal.status as typeof LADDER[number]);
    const to = LADDER.indexOf(status as typeof LADDER[number]);
    const isAdjacentLadderMove = from !== -1 && to !== -1 && Math.abs(from - to) === 1;
    const isPass = status === "passed";
    // A passed deal may be reopened, but only back to the start of the talk.
    const isReopen = deal.status === "passed" && status === "intro";
    if (!isAdjacentLadderMove && !isPass && !isReopen) {
      return NextResponse.json(
        { error: "Deals move one stage at a time.", code: "STAGE_ORDER" },
        { status: 409 },
      );
    }
  }

  // Phase 1: an investor advancing a deal (into diligence or a term sheet)
  // must have accepted the non-circumvention terms for this startup. Deals the
  // investor opened already carry the ack; founder-opened deals reach this
  // gate the first time the investor acts. 428 → client shows the modal,
  // records the ack, and retries. Founders, admins and "passed" are exempt.
  const investorActing = deal.investor?.owner_id === user.id && deal.startup?.owner_id !== user.id;
  if (investorActing && (status === "due_diligence" || status === "term_sheet")) {
    const { data: ack } = await supabase
      .from("circumvention_acks")
      .select("id")
      .match({ investor_id: user.id, startup_id: deal.startup_id })
      .maybeSingle();
    if (!ack) {
      const { data: st } = await supabase.from("startups").select("name").eq("id", deal.startup_id).maybeSingle();
      return NextResponse.json(
        { error: "Please acknowledge the non-circumvention terms first.", code: "ACK_REQUIRED", startupId: deal.startup_id, startupName: st?.name ?? null },
        { status: 428 },
      );
    }
    // Link the ack to the deal (once) and put it on the timeline.
    const admin = createAdminClient();
    const { data: dealRow } = await admin.from("deals").select("circumvention_ack_id").eq("id", dealId).maybeSingle();
    if (dealRow && !dealRow.circumvention_ack_id) {
      await admin.from("deals").update({ circumvention_ack_id: ack.id }).eq("id", dealId).then(undefined, () => {});
      const { data: full } = await admin.from("circumvention_acks").select("acknowledged_at, ip_address").eq("id", ack.id).maybeSingle();
      await admin.from("deal_activity").insert({
        deal_id: dealId, startup_id: deal.startup_id, investor_id: deal.investor_id, actor_id: user.id,
        type: "circumvention_acknowledged",
        body: full ? `${new Date(full.acknowledged_at).toISOString().replace("T", " ").slice(0, 16)} UTC · IP ${maskIp(full.ip_address)}` : null,
      }).then(undefined, () => {});
    }
  }

  // Use close endpoint for closed status (triggers invoice)
  if (status === "closed") {
    return NextResponse.json({ error: "Use /api/deals/close for closing deals" }, { status: 400 });
  }

  const updates: import("@/types/supabase").Database["public"]["Tables"]["deals"]["Update"] = {};
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
  if (commitmentType !== undefined) {
    updates.commitment_type = commitmentType;
    updates.commitment_at = new Date().toISOString();
  }
  if (typeof currency === "string" && isCurrencyCode(currency)) updates.currency = currency;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("deals").update(updates).eq("id", dealId);

    // Every stage move joins the timeline. The body is machine-readable
    // ("intro>due_diligence"); the client renders it in the viewer's
    // language — free-text here would freeze one locale into the history.
    if (!error && status !== undefined && status !== deal.status) {
      const adminLog = createAdminClient();
      await adminLog.from("deal_activity").insert({
        deal_id: dealId, startup_id: deal.startup_id, investor_id: deal.investor_id, actor_id: user.id,
        type: "status_change",
        body: `${deal.status}>${status}${reason ? ` · ${String(reason).slice(0, 200)}` : ""}`,
      }).then(undefined, () => {});
    }
    if (error) {
      console.error("[deals/update]", error);
      return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
    }
  }

  if (commitmentType !== undefined) {
    const LABEL: Record<string, string> = { interest: "Interested", soft_circle: "Soft-circled", verbal: "Verbal commitment", committed: "Committed" };
    const admin = createAdminClient();
    await admin.from("deal_activity").insert({
      deal_id: dealId, startup_id: deal.startup_id, investor_id: deal.investor_id, actor_id: user.id,
      type: "note",
      body: `${LABEL[commitmentType]}${typeof amount === "number" && amount > 0 ? ` · ${(isCurrencyCode(currency) ? currency : "USD")} ${Math.round(amount).toLocaleString()}` : ""}`,
    }).then(undefined, () => {});
    // The other side learns the commitment moved.
    const counterpart = user.id === deal.startup?.owner_id ? deal.investor?.owner_id : deal.startup?.owner_id;
    if (counterpart && counterpart !== user.id) {
      await notifyUsers([counterpart], {
        type: "deal_stage",
        title: `${LABEL[commitmentType]} — deal update`,
        body: typeof amount === "number" && amount > 0 ? `${(isCurrencyCode(currency) ? currency : "USD")} ${Math.round(amount).toLocaleString()}` : null,
        href: `/deals?deal=${dealId}`,
      }).catch(() => {});
    }
  }

  // Guarded on an ACTUAL change: the timeline log lives above (machine-
  // readable, localised by the client). A no-op status POST used to insert a
  // second English "X → X" row AND notify the counterpart of a move that
  // never happened.
  if (status && status !== deal.status) {
    // Tell the other side. A deal moving stage -- especially to passed -- is
    // the thing a counterparty most wants to hear about and previously the
    // thing they were least likely to notice.
    const other = [
      deal.startup?.owner_id,
      deal.investor?.owner_id,
    ].filter((id) => id && id !== user.id);

    const label = STAGE_LABEL[status as string] ?? status;
    await notifyUsers(other, {
      type:  status === "passed" ? "deal_passed" : "deal_stage",
      title: status === "passed" ? "A deal was marked passed" : `A deal moved to ${label}`,
      body:  status === "passed" && typeof reason === "string" && reason.trim() ? reason.trim() : null,
      href:  `/deals?deal=${dealId}`,
    });
  }

  return NextResponse.json({ success: true });
}
