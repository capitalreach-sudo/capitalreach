import { NextRequest, NextResponse } from "next/server";
import { getSafetyConfig, applyMessageSafety, type SafetyConfig } from "@/lib/message-safety";
import { recordIntroduction, detectOffPlatformContact, offPlatformSeverity } from "@/lib/introductions";
import { recordSignal } from "@/lib/trust-signals";
import { dbRateLimit, RATE } from "@/lib/db-rate-limit";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity } from "@/lib/membership";
import { notifyUser } from "@/lib/notify-user";
import { sendNewMessageEmail } from "@/lib/resend";
import { isUuid } from "@/lib/utils";
import { getLaunchStatus } from "@/lib/launchMode";
import { buildAccessContext, canSendMessages, getMessageLimit, type AccessContext } from "@/lib/access";
import { messageRatelimit, isRedisConfigured } from "@/lib/redis";
import { evaluateGate, gateRefusal, getGateConfig, investorGateSubject } from "@/lib/trust-gates";

/**
 * The plan's monthly new-thread allowance, enforced on every path that OPENS
 * a thread (openOnly included -- opening is the metered act). null = unlimited:
 * launch mode and admins resolve to unlimited through the ctx builders, so the
 * window below never runs for them. For finite limits the Redis window fails
 * CLOSED -- an unconfigured or erroring limiter refuses the NEW thread rather
 * than turning a metered tier into an unmetered one. Replies inside existing
 * threads are unaffected (they go through /api/messages/reply).
 *
 * Keyed by the investor entity id, same as /api/messages/send, so both routes
 * spend from the one monthly window.
 */
async function newThreadLimitResponse(ctx: AccessContext, investorEntityId: string): Promise<NextResponse | null> {
  const messageLimit = getMessageLimit(ctx);
  if (messageLimit === null) return null;
  if (messageLimit <= 0) {
    return NextResponse.json({ error: "Messaging is not included in your plan. Upgrade to start conversations." }, { status: 403 });
  }
  if (!isRedisConfigured) {
    return NextResponse.json({ error: "New conversations are temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
  try {
    const { success } = await messageRatelimit.limit(investorEntityId);
    if (!success) {
      return NextResponse.json({
        error: `Monthly message limit reached (${messageLimit} threads). Upgrade to Pro for unlimited messaging.`,
      }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: "New conversations are temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
  return null;
}

/**
 * POST { investorId, body } — founder outbound (B23): start (or continue)
 * the thread with an investor straight from their profile. /api/messages/
 * send is the investor→founder direction with its tier gate; this is the
 * founder→investor direction, which has no paywall but does notify + email
 * the investor (a browser-side insert did neither).
 *
 * POST { startupId, body } — founder→founder (migration 012 gave threads a
 * recipient_startup_id for exactly this; the route finally uses it). Two
 * founders comparing notes is how a marketplace becomes a community.
 *
 * Since 098 the sender may also be an INVESTOR: investor→startup opens the
 * classic (startup, investor) pair, investor→investor opens a direct thread
 * with no startup anchor. Every pairing on the platform can now talk.
 *
 * Investor senders carry the same tier gate as /api/messages/send: the plan
 * must include messaging at all, and every NEW thread spends from the same
 * monthly allowance (newThreadLimitResponse below). Founder senders stay
 * ungated -- founder outbound has never had a paywall.
 */
/**
 * Opening a conversation is always first contact, so no deal exists yet and
 * contact details are withheld until the pair registers one. Shared by every
 * insert site in this route so the four cannot drift apart.
 */
function safeBody(body: string, config: SafetyConfig) {
  const safe = applyMessageSafety({ body, dealRegistered: false, config });
  return {
    body: safe.body,
    body_original: safe.bodyOriginal,
    safety_flags: safe.flags ? JSON.parse(JSON.stringify(safe.flags)) : null,
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  // Redis-independent brake: opening conversations notifies + emails the
  // other side, so cap the fan-out (the Upstash limiter fails open in prod).
  { const rl = await dbRateLimit(user.id, "msg_start", ...Object.values(RATE.perHour(30)) as [number, number]);
    if (!rl.ok) return NextResponse.json({ error: "You're sending messages too fast. Try again in a bit." }, { status: 429 }); }

  const payload = await req.json().catch(() => ({}));
  const investorId = typeof payload.investorId === "string" ? payload.investorId : "";
  const targetStartupId = typeof payload.startupId === "string" ? payload.startupId : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  // open:true = "make an intro": create or find the thread and hand back its
  // id for a redirect into Messages — the first words are typed THERE, in
  // the real composer, not in a cramped profile-page box.
  const SAFETY = await getSafetyConfig();
  const openOnly = payload.open === true;
  if (!isUuid(investorId) && !isUuid(targetStartupId)) return NextResponse.json({ error: "investorId or startupId required" }, { status: 400 });
  if (!body && !openOnly) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  if (body.length > 2000) return NextResponse.json({ error: "Message is too long (max 2000 characters)" }, { status: 400 });

  const mine = await resolveEntity(user.id, "startup");
  const admin = createAdminClient();

  // ── Investor sender ─────────────────────────────────────────────────────
  if (!mine) {
    const myInv = await resolveEntity(user.id, "investor");
    if (!myInv) return NextResponse.json({ error: "Create a profile first" }, { status: 403 });
    const { data: me } = await admin.from("investors")
      .select("id, display_name, firm_name, subscription_tier").eq("id", myInv.entityId).maybeSingle();
    if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const myName = me.display_name ?? me.firm_name ?? "An investor";

    // Tier gate, same derivation as /api/messages/send: capabilities come
    // from the ctx builders (never tier-name checks), so launch mode and
    // admin accounts pass through exactly as they do everywhere else. The
    // investor entity's tier governs over the profile's (plan-gate.ts rule).
    const [{ data: senderProfile }, { isLaunch }] = await Promise.all([
      admin.from("profiles").select("id, role, subscription_tier, suspended, account_status").eq("id", user.id).maybeSingle(),
      getLaunchStatus(),
    ]);
    const baseCtx = buildAccessContext(senderProfile ?? null, isLaunch);
    const ctx: AccessContext = me.subscription_tier ? { ...baseCtx, tier: me.subscription_tier } : baseCtx;
    if (!canSendMessages(ctx)) {
      return NextResponse.json({ error: "Messaging is not included in your plan. Upgrade to start conversations." }, { status: 403 });
    }

    // Trust gate: a SECOND, independent check that sits beside the plan gate
    // rather than replacing it -- a paid plan says the account may message,
    // level 2 says there is an identified human behind it. Advance-fee
    // approaches need an anonymous sender, so this is where they stop. It
    // refuses before any thread or message row exists, and only on the
    // investor side: a founder answering their own inbound is never held
    // hostage by their own verification state. Admins pass, as everywhere.
    if (senderProfile?.role !== "admin") {
      const gateSubject = await investorGateSubject(user.id);
      if (gateSubject) {
        const verdict = evaluateGate("message", gateSubject, await getGateConfig());
        if (!verdict.allowed) return NextResponse.json(gateRefusal(verdict), { status: 403 });
      }
    }

    // investor → investor: a direct thread, no startup anchor (098).
    if (isUuid(investorId)) {
      const { data: other } = await admin.from("investors")
        .select("id, owner_id, display_name, firm_name").eq("id", investorId).maybeSingle();
      if (!other) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (other.id === me.id) return NextResponse.json({ error: "That is your own profile" }, { status: 400 });

      const { data: existing } = await admin.from("threads").select("id")
        .is("startup_id", null)
        .or(`and(investor_id.eq.${me.id},recipient_investor_id.eq.${other.id}),and(investor_id.eq.${other.id},recipient_investor_id.eq.${me.id})`)
        .limit(1).maybeSingle();
      let threadId = existing?.id;
      if (!threadId) {
        const limited = await newThreadLimitResponse(ctx, me.id);
        if (limited) return limited;
        const { data: created, error } = await admin.from("threads")
          .insert({ investor_id: me.id, recipient_investor_id: other.id, status: "active" }).select("id").single();
        if (error || !created) {
          // 23505: a concurrent request created the pair's thread between our
          // SELECT and INSERT (unique index from 106). Use theirs.
          const { data: raced } = await admin.from("threads").select("id")
            .is("startup_id", null)
            .or(`and(investor_id.eq.${me.id},recipient_investor_id.eq.${other.id}),and(investor_id.eq.${other.id},recipient_investor_id.eq.${me.id})`)
            .limit(1).maybeSingle();
          if (!raced) return NextResponse.json({ error: "Could not start conversation" }, { status: 500 });
          threadId = raced.id;
        } else {
          threadId = created.id;
        }
      }
      if (openOnly) return NextResponse.json({ success: true, threadId });
      const { data: message, error: mErr } = await admin.from("messages").insert({ thread_id: threadId, sender_id: user.id, ...safeBody(body, SAFETY) }).select().single();
      if (mErr || !message) return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
      await admin.from("threads").update({ updated_at: message.created_at }).eq("id", threadId).then(undefined, () => {});
      if (other.owner_id && other.owner_id !== user.id) {
        const preview = body.slice(0, 60) + (body.length > 60 ? "…" : "");
        await notifyUser({ userId: other.owner_id, type: "message", title: `New message from ${myName}`, body: preview, titleKey: "notif.messageTitle", params: { name: myName }, href: `/dashboard/messages?thread=${threadId}` }).catch(() => {});
        const { data: p } = await admin.from("profiles").select("email").eq("id", other.owner_id).maybeSingle();
        if (p?.email) await sendNewMessageEmail(p.email, myName, myName, preview).catch(() => {});
      }
      return NextResponse.json({ success: true, threadId });
    }

    // investor → startup: the classic pair, opened from the investor side.
    if (isUuid(targetStartupId)) {
      const { data: st } = await admin.from("startups")
        .select("id, owner_id, name, status").eq("id", targetStartupId).maybeSingle();
      if (!st || st.status !== "active") return NextResponse.json({ error: "Not found" }, { status: 404 });

      const { data: existing } = await admin.from("threads").select("id")
        .match({ startup_id: st.id, investor_id: me.id }).maybeSingle();
      let threadId = existing?.id;
      if (!threadId) {
        const limited = await newThreadLimitResponse(ctx, me.id);
        if (limited) return limited;
        const { data: created, error } = await admin.from("threads")
          .insert({ startup_id: st.id, investor_id: me.id, status: "active" }).select("id").single();
        if (error || !created) return NextResponse.json({ error: "Could not start conversation" }, { status: 500 });
        threadId = created.id;
      }
      // First contact between this pair, if it is the first. The fee claim
      // and the non-circumvention tail both date from here, and opening the
      // thread IS the contact -- so it is recorded before the openOnly return.
      await recordIntroduction({ startupId: st.id, investorId: me.id, channel: "message" });
      if (openOnly) return NextResponse.json({ success: true, threadId });
      const { data: message, error: mErr } = await admin.from("messages").insert({ thread_id: threadId, sender_id: user.id, ...safeBody(body, SAFETY) }).select().single();
      if (mErr || !message) return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
      await admin.from("threads").update({ updated_at: message.created_at }).eq("id", threadId).then(undefined, () => {});
      // Contact details in a first approach are the circumvention vector, and
      // often the opening move of an advance-fee pitch. Flagged for a human,
      // never blocked: founders legitimately swap calendar links.
      {
        const found = detectOffPlatformContact(body);
        if (found.length) {
          await recordSignal("investor", me.id, "offplatform_contact", offPlatformSeverity(found),
            { kinds: found.map((f) => f.kind), startupId: st.id, at: "first_message" });
        }
      }
      if (st.owner_id && st.owner_id !== user.id) {
        const preview = body.slice(0, 60) + (body.length > 60 ? "…" : "");
        await notifyUser({ userId: st.owner_id, type: "message", title: `New message from ${myName}`, body: preview, titleKey: "notif.messageTitle", params: { name: myName }, href: `/dashboard/messages?thread=${threadId}` }).catch(() => {});
        const { data: p } = await admin.from("profiles").select("email").eq("id", st.owner_id).maybeSingle();
        if (p?.email) await sendNewMessageEmail(p.email, myName, myName, preview).catch(() => {});
      }
      return NextResponse.json({ success: true, threadId });
    }
    return NextResponse.json({ error: "investorId or startupId required" }, { status: 400 });
  }


  // Founder → founder.
  if (isUuid(targetStartupId)) {
    const [{ data: other }, { data: me }] = await Promise.all([
      admin.from("startups").select("id, owner_id, name, status").eq("id", targetStartupId).maybeSingle(),
      admin.from("startups").select("id, name").eq("id", mine.entityId).maybeSingle(),
    ]);
    if (!other || !me || other.status !== "active") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (other.id === me.id) return NextResponse.json({ error: "That is your own listing" }, { status: 400 });

    // One thread per ordered pair is enough — either founder's earlier thread
    // (in either direction) is reused rather than split.
    const { data: existing } = await admin.from("threads").select("id")
      .or(`and(startup_id.eq.${me.id},recipient_startup_id.eq.${other.id}),and(startup_id.eq.${other.id},recipient_startup_id.eq.${me.id})`)
      .limit(1).maybeSingle();
    let threadId = existing?.id;
    if (!threadId) {
      const { data: created, error } = await admin.from("threads")
        .insert({ startup_id: me.id, recipient_startup_id: other.id, status: "active" }).select("id").single();
      if (error || !created) return NextResponse.json({ error: "Could not start conversation" }, { status: 500 });
      threadId = created.id;
    }
    if (openOnly) return NextResponse.json({ success: true, threadId });
    const { data: message, error: mErr } = await admin.from("messages").insert({ thread_id: threadId, sender_id: user.id, ...safeBody(body, SAFETY) }).select().single();
    if (mErr || !message) return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    await admin.from("threads").update({ updated_at: message.created_at }).eq("id", threadId).then(undefined, () => {});

    if (other.owner_id && other.owner_id !== user.id) {
      const preview = body.slice(0, 60) + (body.length > 60 ? "…" : "");
      await notifyUser({ userId: other.owner_id, type: "message", title: `New message from ${me.name}`, body: preview, titleKey: "notif.messageTitle", params: { name: me.name }, href: `/dashboard/messages?thread=${threadId}` }).catch(() => {});
      const { data: p } = await admin.from("profiles").select("email").eq("id", other.owner_id).maybeSingle();
      if (p?.email) await sendNewMessageEmail(p.email, me.name, me.name, preview).catch(() => {});
    }
    return NextResponse.json({ success: true, threadId, startupId: me.id });
  }

  const [{ data: inv }, { data: st }] = await Promise.all([
    admin.from("investors").select("id, owner_id, display_name").eq("id", investorId).maybeSingle(),
    admin.from("startups").select("id, name").eq("id", mine.entityId).maybeSingle(),
  ]);
  if (!inv || !st) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: existing } = await admin.from("threads").select("id").match({ startup_id: st.id, investor_id: inv.id }).maybeSingle();
  let threadId = existing?.id;
  if (!threadId) {
    const { data: created, error } = await admin.from("threads").insert({ startup_id: st.id, investor_id: inv.id, status: "active" }).select("id").single();
    if (error || !created) return NextResponse.json({ error: "Could not start conversation" }, { status: 500 });
    threadId = created.id;
  }
  if (openOnly) return NextResponse.json({ success: true, threadId, startupId: st.id, investorId: inv.id });
  const { data: message, error: mErr } = await admin.from("messages").insert({ thread_id: threadId, sender_id: user.id, ...safeBody(body, SAFETY) }).select().single();
  if (mErr || !message) return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  await admin.from("threads").update({ updated_at: message.created_at }).eq("id", threadId).then(undefined, () => {});

  if (inv.owner_id && inv.owner_id !== user.id) {
    const preview = body.slice(0, 60) + (body.length > 60 ? "…" : "");
    await notifyUser({ userId: inv.owner_id, type: "message", title: `New message from ${st.name}`, body: preview, titleKey: "notif.messageTitle", params: { name: st.name }, href: `/dashboard/messages?thread=${threadId}` }).catch(() => {});
    const { data: p } = await admin.from("profiles").select("email").eq("id", inv.owner_id).maybeSingle();
    if (p?.email) await sendNewMessageEmail(p.email, st.name, st.name, preview).catch(() => {});
  }
  return NextResponse.json({ success: true, threadId, startupId: st.id, investorId: inv.id });
}
