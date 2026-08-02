import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isCurrencyCode, DEFAULT_CURRENCY } from "@/lib/currency";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity } from "@/lib/membership";
import { sendDealOpenedEmail } from "@/lib/resend";
import { notifyUser } from "@/lib/notify-user";

// Creates a deal. Startups/investors pick a single counterpart and their own
// side is derived from their profile — never trusted from the request body.
// Admin isn't a participant on either side, so it explicitly names both.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A suspended account must not be able to write. The RESTRICTIVE policies in
  // 017 don't cover this route because the write goes through the service role.
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }


  const { counterpartId, startupId, investorId, amount, currency, status, note, nextFollowUp } =
    await req.json();
  const dealCurrency = isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY;
  const parsedAmount = typeof amount === "number" && amount > 0 ? Math.round(amount) : null;

  // Every deal used to start at "intro", so a relationship that was already at
  // diligence had to be created and then immediately dragged across the board.
  // closed and passed are excluded deliberately: closing raises a success-fee
  // invoice through /api/deals/close, and letting a deal be born closed would
  // route around that entirely.
  const OPENING_STAGES = ["intro", "due_diligence", "term_sheet"] as const;
  const startStatus = OPENING_STAGES.includes(status) ? status : "intro";

  const openingNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 2000) : null;

  // Accepts a plain YYYY-MM-DD; anything else is dropped rather than guessed at.
  const followUp =
    typeof nextFollowUp === "string" && /^\d{4}-\d{2}-\d{2}$/.test(nextFollowUp)
      ? nextFollowUp
      : null;

  const admin = createAdminClient();

  let startup_id: string;
  let investor_id: string;

  if (startupId && investorId) {
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [{ data: st }, { data: inv }] = await Promise.all([
      admin.from("startups").select("id").eq("id", startupId).maybeSingle(),
      admin.from("investors").select("id").eq("id", investorId).maybeSingle(),
    ]);
    if (!st) return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    if (!inv) return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    startup_id  = st.id;
    investor_id = inv.id;
  } else if (counterpartId && typeof counterpartId === "string") {
    // Which side is the caller on? resolveEntity checks ownership first and
    // team membership second, so an associate opens deals for the firm rather
    // than being told to "complete onboarding" they already completed.
    const [myStartup, myInvestor] = await Promise.all([
      resolveEntity(user.id, "startup"),
      resolveEntity(user.id, "investor"),
    ]);

    if (myStartup) {
      const { data: inv } = await admin.from("investors").select("id").eq("id", counterpartId).maybeSingle();
      if (!inv) return NextResponse.json({ error: "Investor not found" }, { status: 404 });
      startup_id  = myStartup.entityId;
      investor_id = inv.id;
    } else if (myInvestor) {
      const { data: st } = await admin.from("startups").select("id, status").eq("id", counterpartId).maybeSingle();
      if (!st) return NextResponse.json({ error: "Startup not found" }, { status: 404 });
      // `status` was already being selected here but never tested, so an
      // investor holding a draft/suspended/rejected listing's id could open a
      // deal against a company that isn't listed. Only active ones are open
      // for business.
      if (st.status !== "active") {
        return NextResponse.json({ error: "That startup is not currently listed" }, { status: 409 });
      }
      startup_id  = st.id;
      investor_id = myInvestor.entityId;
    } else {
      return NextResponse.json({ error: "Complete onboarding first" }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: "Missing counterpart" }, { status: 400 });
  }

  // One open deal per pair — closed/passed pairs may start a fresh one.
  const { data: existing } = await admin
    .from("deals")
    .select("id")
    .eq("startup_id", startup_id)
    .eq("investor_id", investor_id)
    .not("status", "in", "(closed,passed)")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "An open deal with this partner already exists" }, { status: 409 });
  }

  const { data: deal, error } = await admin
    .from("deals")
    .insert({
      startup_id,
      investor_id,
      amount: parsedAmount,
      currency: dealCurrency,
      status: startStatus,
      next_follow_up: followUp,
    })
    .select()
    .single();
  if (error || !deal) {
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }

  // Seed the timeline. Without this the activity feed on a new deal is empty
  // until someone happens to act on it, so there is no record of who opened it,
  // when, or on what terms -- and the first entry ends up being a status change
  // out of a stage nobody can see was ever set.
  await admin.from("deal_activity").insert({
    deal_id:     deal.id,
    startup_id,
    investor_id,
    actor_id:    user.id,
    type:        openingNote ? "note" : "status_change",
    body:        openingNote,
  }).then(undefined, () => {});

  // Tell the other side. A deal appearing silently in someone's pipeline is
  // the kind of thing that gets noticed a week late.
  //
  // Awaited, not fire-and-forget. On Vercel the lambda is frozen the moment
  // the response is sent, so an un-awaited promise here simply never ran in
  // production: deals were created and the counterpart's bell stayed silent
  // (observed live -- create returned 200, notifications table stayed empty).
  // Failures are still swallowed; a deal without its notification beats a 500.
  await notifyCounterpart(admin, { dealId: deal.id, startup_id, investor_id, actorId: user.id }).catch(() => {});

  return NextResponse.json({ success: true, deal });
}

/**
 * Emails whichever participant did not open the deal. Failure is swallowed by
 * the caller: a deal that exists but whose notification bounced is a far better
 * outcome than a 500 on an otherwise successful create.
 */
async function notifyCounterpart(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  { dealId, startup_id, investor_id, actorId }: { dealId: string; startup_id: string; investor_id: string; actorId: string }
) {
  const [{ data: st }, { data: inv }] = await Promise.all([
    admin.from("startups").select("name, owner_id").eq("id", startup_id).maybeSingle(),
    admin.from("investors").select("display_name, owner_id").eq("id", investor_id).maybeSingle(),
  ]);
  if (!st || !inv) return;

  // The recipient is whichever owner isn't the one who clicked create. An admin
  // creating on behalf of both is neither, so both sides get told.
  const recipients = [st.owner_id, inv.owner_id].filter((id: string) => id && id !== actorId);
  if (recipients.length === 0) return;

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", recipients);

  for (const p of profiles ?? []) {
    const isFounder = p.id === st.owner_id;
    const otherName = isFounder ? (inv.display_name || "An investor") : (st.name || "A startup");

    // In-app first: it works today. The email below needs a verified sending
    // domain the project does not have yet, so it currently no-ops -- without
    // this the counterpart still learns nothing.
    await notifyUser({
      userId: p.id,
      type:   "deal_opened",
      title:  `${otherName} opened a deal with you`,
      href:   `/deals?deal=${dealId}`,
    });

    await sendDealOpenedEmail(p.email, p.full_name || "there", otherName).catch(() => {});
  }
}
