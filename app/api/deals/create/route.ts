import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isCurrencyCode, DEFAULT_CURRENCY } from "@/lib/currency";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity } from "@/lib/membership";
import { sendDealOpenedEmail } from "@/lib/resend";
import { notifyUser } from "@/lib/notify-user";
import { maskIp } from "@/lib/identity";

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
    await req.json().catch(() => ({}));
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
  // A deal is a relationship, and one party cannot declare a relationship on
  // behalf of two. Anything with a real counterparty becomes a PROPOSAL the
  // other side must accept; only admin-created deals and a founder's own
  // off-platform contacts skip the consent step, because there is nobody to
  // ask.
  let needsConsent = false;
  let fromSide: "startup" | "investor" = "investor";
  // Set when the caller is the investor side: the non-circumvention ack this
  // deal was opened under (Phase 1). Founders/admins opening deals need none.
  let ack: { id: string; acknowledged_at: string; ip_address: string | null } | null = null;

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
      const { data: inv } = await admin.from("investors").select("id, is_external, owner_id").eq("id", counterpartId).maybeSingle();
      if (!inv) return NextResponse.json({ error: "Investor not found" }, { status: 404 });
      startup_id  = myStartup.entityId;
      investor_id = inv.id;
      // An off-platform contact has no account and therefore nobody to
      // consent — the founder's own pipeline entry stays direct. A platform
      // investor, by contrast, must approve before appearing in anyone's
      // funnel.
      needsConsent = !inv.is_external && !!inv.owner_id;
      fromSide = "startup";
    } else if (myInvestor) {
      // Browsing is open to everyone; *investing* requires the accreditation
      // attestation. Attestable any time from Settings — this is a gate on the
      // action, not on the account.
      const { data: attest } = await admin
        .from("profiles").select("accreditation_certified").eq("id", user.id).maybeSingle();
      if (!attest?.accreditation_certified) {
        return NextResponse.json(
          { error: "Confirm your accredited-investor status in Settings to start a deal." },
          { status: 403 },
        );
      }
      const { data: st } = await admin.from("startups").select("id, status, round_state").eq("id", counterpartId).maybeSingle();
      if (!st) return NextResponse.json({ error: "Startup not found" }, { status: 404 });
      // B16: the founder closed or paused the round — no new interest.
      if (st.round_state === "closed" || st.round_state === "paused") {
        return NextResponse.json({ error: st.round_state === "closed" ? "This round is closed to new investors." : "This round is paused by the founder." }, { status: 409 });
      }
      // `status` was already being selected here but never tested, so an
      // investor holding a draft/suspended/rejected listing's id could open a
      // deal against a company that isn't listed. Only active ones are open
      // for business.
      if (st.status !== "active") {
        return NextResponse.json({ error: "That startup is not currently listed" }, { status: 409 });
      }
      // The investor must have accepted the non-circumvention terms for THIS
      // startup before a deal can open. Enforced here, not just in the UI, so
      // no client can route around the acknowledgment. 428 = the client
      // should show the modal and retry.
      const { data: existingAck } = await admin
        .from("circumvention_acks")
        .select("id, acknowledged_at, ip_address")
        .match({ investor_id: user.id, startup_id: st.id })
        .maybeSingle();
      if (!existingAck) {
        return NextResponse.json(
          { error: "Please acknowledge the non-circumvention terms first.", code: "ACK_REQUIRED", startupId: st.id },
          { status: 428 },
        );
      }
      ack = existingAck;
      startup_id  = st.id;
      investor_id = myInvestor.entityId;
      needsConsent = true;
      fromSide = "investor";
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

  if (needsConsent) {
    const { data: proposal, error: propErr } = await admin
      .from("deal_proposals")
      .insert({
        startup_id,
        investor_id,
        proposed_by: user.id,
        from_side: fromSide,
        amount: parsedAmount,
        currency: dealCurrency,
        opening_status: startStatus,
        note: openingNote,
        next_follow_up: followUp,
        circumvention_ack_id: ack?.id ?? null,
      })
      .select("id")
      .single();
    if (propErr || !proposal) {
      if (propErr?.code === "23505") {
        return NextResponse.json({ error: "A request with this partner is already waiting for an answer." }, { status: 409 });
      }
      return NextResponse.json({ error: "Failed to send the request" }, { status: 500 });
    }

    // Tell the side being asked. Awaited — the Vercel lambda freezes on
    // response, same lesson as every other notify in this codebase.
    await notifyProposal(admin, { startup_id, investor_id, fromSide, actorId: user.id }).catch(() => {});

    return NextResponse.json({ success: true, proposal: { id: proposal.id, status: "pending" } });
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
      circumvention_ack_id: ack?.id ?? null,
    })
    .select()
    .single();
  if (error || !deal) {
    // The pre-insert check above has a race window; migration 028's partial
    // unique index (deals_one_open_per_pair) is the backstop. When two
    // requests race, the loser lands here with 23505 -- same answer as the
    // check would have given.
    if (error?.code === "23505") {
      return NextResponse.json({ error: "An open deal with this partner already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }

  // Seed the timeline. Without this the activity feed on a new deal is empty
  // until someone happens to act on it, so there is no record of who opened it,
  // when, or on what terms -- and the first entry ends up being a status change
  // out of a stage nobody can see was ever set.
  // First line of an investor-opened deal: the timestamped acknowledgment.
  // Both parties can read it; the IP is masked on the shared timeline (the
  // full value stays in circumvention_acks, service-role only).
  if (ack) {
    await admin.from("deal_activity").insert({
      deal_id:     deal.id,
      startup_id,
      investor_id,
      actor_id:    user.id,
      type:        "circumvention_acknowledged",
      body:        `${new Date(ack.acknowledged_at).toISOString().replace("T", " ").slice(0, 16)} UTC · IP ${maskIp(ack.ip_address)}`,
    }).then(undefined, () => {});
  }
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

/** Tells the side whose consent is being asked for. */
async function notifyProposal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  { startup_id, investor_id, fromSide, actorId }: { startup_id: string; investor_id: string; fromSide: "startup" | "investor"; actorId: string },
) {
  const [{ data: st }, { data: inv }] = await Promise.all([
    admin.from("startups").select("name, owner_id").eq("id", startup_id).maybeSingle(),
    admin.from("investors").select("display_name, firm_name, owner_id").eq("id", investor_id).maybeSingle(),
  ]);
  const recipient = fromSide === "investor" ? st?.owner_id : inv?.owner_id;
  if (!recipient || recipient === actorId) return;
  const proposerName = fromSide === "investor"
    ? (inv?.firm_name || inv?.display_name || "An investor")
    : (st?.name || "A startup");
  const { notifyUser } = await import("@/lib/notify-user");
  await notifyUser({
    userId: recipient,
    type: "deal_opened",
    title: `${proposerName} wants to open a deal`,
    body: "Accept to add it to both pipelines, or decline.",
    href: "/deals",
  });
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
