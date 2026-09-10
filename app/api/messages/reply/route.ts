import { NextRequest, NextResponse } from "next/server";
import { getSafetyConfig, applyMessageSafety } from "@/lib/message-safety";
import { dealRegistrationRequired, registrationRequired } from "@/lib/deal-registration";
import { mayInvestorContact, contactRefusal, contactsUnlocked } from "@/lib/contact-policy";
import { dbRateLimit, RATE } from "@/lib/db-rate-limit";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { isTeamMemberOfEither } from "@/lib/membership";
import { notifyUser } from "@/lib/notify-user";
import { sendNewMessageEmail } from "@/lib/resend";

const MAX_LEN = 2000;

/**
 * POST { threadId, body } — a reply inside an existing thread.
 *
 * Replies used to be direct table inserts from the browser, which meant the
 * other participant was never told: no bell, no email. New threads went
 * through /api/messages/send (which notifies) but every message after the
 * first was silent. This route owns the reply so the recipient always hears
 * about it, the length limit is enforced server-side, and the thread's
 * updated_at moves.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  { const rl = await dbRateLimit(user.id, "msg_reply", ...Object.values(RATE.perHour(60)) as [number, number]);
    if (!rl.ok) return NextResponse.json({ error: "You're sending messages too fast. Try again in a bit." }, { status: 429 }); }
  if (await isAccountSuspended(user.id)) {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const payload = await req.json().catch(() => ({}));
  const threadId = typeof payload.threadId === "string" ? payload.threadId : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) return NextResponse.json({ error: "Invalid thread" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  if (body.length > MAX_LEN) return NextResponse.json({ error: `Message is too long (max ${MAX_LEN} characters)` }, { status: 400 });

  const admin = createAdminClient();
  const { data: thread } = await admin
    .from("threads")
    .select("id, status, startup_id, investor_id, recipient_startup_id, recipient_investor_id, startup:startups!threads_startup_id_fkey(name, owner_id), investor:investors!threads_investor_id_fkey(owner_id, display_name), recipient_investor:investors!threads_recipient_investor_id_fkey(owner_id, display_name)")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.status === "archived" || thread.status === "blocked") {
    return NextResponse.json({ error: "This conversation is closed" }, { status: 409 });
  }

  // Participants: startup owner, investor owner, or (startup↔startup peer
  // threads) the recipient startup's owner. Team members of either side too.
  let recipientStartupOwner: string | null = null;
  if (thread.recipient_startup_id) {
    const { data: rs } = await admin.from("startups").select("owner_id, name").eq("id", thread.recipient_startup_id).maybeSingle();
    recipientStartupOwner = rs?.owner_id ?? null;
  }
  const startupOwner = thread.startup?.owner_id ?? null;
  const investorOwner = thread.investor?.owner_id ?? null;
  // C32: co-investor threads have a second investor as a participant. On
  // those, the startup owner is NOT a party — two investors talking about a
  // company is not a conversation the company is in.
  const coInvestorThread = !!thread.recipient_investor_id;
  const recipientInvestorOwner = (thread.recipient_investor as unknown as { owner_id: string } | null)?.owner_id ?? null;
  const isParty = coInvestorThread
    ? user.id === investorOwner || user.id === recipientInvestorOwner
    : (user.id === startupOwner || user.id === investorOwner || user.id === recipientStartupOwner ||
       (await isTeamMemberOfEither(user.id, thread.startup_id, thread.investor_id ?? "")));
  let isAdmin = false;
  if (!isParty) {
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    isAdmin = prof?.role === "admin";
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Offer before contact: on a startup/investor thread the INVESTOR side may
  // only continue once an offer of theirs was accepted or a deal exists. The
  // founder side is never gated -- answering is the behaviour the rule exists
  // to produce, and holding a founder's reply would punish the wrong party.
  // Co-investor threads are not contact with a company at all. Checked before
  // the insert so a refusal leaves no half-sent message.
  const pairStartupId = thread.startup_id;
  const pairInvestorId = thread.investor_id;
  if (!coInvestorThread && !isAdmin && pairStartupId && pairInvestorId) {
    // Ownership answers "which side is this" for almost everyone; the roster
    // lookup only runs for an associate acting on an entity's behalf, since
    // an associate at a fund is the investor side just as much as its owner.
    // A STARTUP seat deliberately wins a tie, so nobody on the founder side
    // can be gated by an incidental seat on an investor's roster.
    let investorSide = user.id === investorOwner;
    if (!investorSide && user.id !== startupOwner && user.id !== recipientStartupOwner) {
      const { data: seats } = await admin
        .from("team_members").select("entity_type")
        .eq("user_id", user.id)
        .in("entity_id", [pairStartupId, pairInvestorId]);
      const kinds = new Set((seats ?? []).map((s) => s.entity_type));
      investorSide = !kinds.has("startup") && kinds.has("investor");
    }
    if (investorSide) {
      // Admins moderate rather than transact, so they are never held to the
      // offer rule. Read only here: the block is unreachable for the one
      // caller whose role was already resolved above (a non-party admin).
      const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (prof?.role !== "admin") {
        const contact = await mayInvestorContact({ startupId: pairStartupId, investorId: pairInvestorId });
        if (!contact.allowed) return NextResponse.json(contactRefusal(contact), { status: 403 });
      }
    }
  }

  // Past the point where this is plainly a negotiation, the deal goes on the
  // record before the next message. Only the INVESTOR side is asked: the fee
  // is the company's to pay, and holding a founder's replies hostage would
  // punish the wrong party for the same conversation. Co-investor threads are
  // exempt -- two investors talking about a company are not transacting with
  // it. Checked before the insert so a refusal leaves no half-sent message.
  if (!coInvestorThread && user.id === investorOwner && thread.startup_id && thread.investor_id) {
    const reg = await dealRegistrationRequired({
      startupId: thread.startup_id,
      investorId: thread.investor_id,
    });
    if (reg.required) {
      return NextResponse.json(registrationRequired(reg), { status: 409 });
    }
  }

  // Contact details are withheld until the pair is on the record, and freely
  // exchanged after; scam patterns are marked either way. The browser reads
  // this table directly, so this has to happen on write -- there is no server
  // hop later where a mask could be applied.
  const safetyCfg = await getSafetyConfig();
  // Keyed on the SEAL, not on deal registration. Registration is retired and
  // its helper answers "not required" when the feature is off, which read as
  // "already registered" here and switched masking off for every reply on the
  // platform. A gate whose disabled state means "let everything through" must
  // never be asked a question phrased the other way round.
  const unlocked = !coInvestorThread && thread.startup_id && thread.investor_id
    ? await contactsUnlocked({ startupId: thread.startup_id, investorId: thread.investor_id })
    : true;
  const safe = applyMessageSafety({ body, dealRegistered: unlocked, config: safetyCfg });

  const { data: message, error } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      sender_id: user.id,
      body: safe.body,
      body_original: safe.bodyOriginal,
      // Serialised through JSON so the typed jsonb column accepts it.
      safety_flags: safe.flags ? JSON.parse(JSON.stringify(safe.flags)) : null,
    })
    .select()
    .single();
  if (error || !message) return NextResponse.json({ error: "Failed to send message" }, { status: 500 });

  await admin.from("threads").update({ updated_at: message.created_at }).eq("id", threadId).then(undefined, () => {});

  // Tell everyone on the thread who isn't the sender. Awaited: on Vercel an
  // un-awaited promise after the response is simply never run.
  const recipients = Array.from(new Set(
    (coInvestorThread ? [investorOwner, recipientInvestorOwner] : [startupOwner, investorOwner, recipientStartupOwner])
      .filter((id): id is string => !!id && id !== user.id),
  ));
  if (recipients.length) {
    const [{ data: sender }, { data: profiles }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      admin.from("profiles").select("id, email").in("id", recipients),
    ]);
    const senderName = sender?.full_name || thread.investor?.display_name || "Someone";
    const preview = safe.body.slice(0, 60) + (body.length > 60 ? "…" : "");
    for (const r of recipients) {
      await notifyUser({
        userId: r,
        type: "message",
        title: `New message from ${senderName}`,
        body: preview,
        href: `/dashboard/messages?thread=${threadId}`,
      }).catch(() => {});
    }
    // Email carries a 60-char preview only — the full text lives on the
    // platform (part of the deal record), which is also where replies happen.
    for (const p of profiles ?? []) {
      if (p.email) await sendNewMessageEmail(p.email, senderName, thread.startup?.name || "your conversation", preview).catch(() => {});
    }
  }

  return NextResponse.json({
    success: true,
    message,
    // Never rewrite somebody's words without telling them.
    ...(safe.maskedAnything ? { contactsWithheld: safe.flags?.masked ?? [] } : {}),
  });
}
