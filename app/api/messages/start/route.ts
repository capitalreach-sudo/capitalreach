import { NextRequest, NextResponse } from "next/server";
import { dbRateLimit, RATE } from "@/lib/db-rate-limit";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isAccountSuspended } from "@/lib/suspension-guard";
import { resolveEntity } from "@/lib/membership";
import { notifyUser } from "@/lib/notify-user";
import { sendNewMessageEmail } from "@/lib/resend";
import { isUuid } from "@/lib/utils";

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
 */
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
      .select("id, display_name, firm_name").eq("id", myInv.entityId).maybeSingle();
    if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const myName = me.display_name ?? me.firm_name ?? "An investor";

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
      const { data: message, error: mErr } = await admin.from("messages").insert({ thread_id: threadId, sender_id: user.id, body }).select().single();
      if (mErr || !message) return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
      await admin.from("threads").update({ updated_at: message.created_at }).eq("id", threadId).then(undefined, () => {});
      if (other.owner_id && other.owner_id !== user.id) {
        const preview = body.slice(0, 60) + (body.length > 60 ? "…" : "");
        await notifyUser({ userId: other.owner_id, type: "message", title: `New message from ${myName}`, body: preview, href: `/dashboard/messages?thread=${threadId}` }).catch(() => {});
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
        const { data: created, error } = await admin.from("threads")
          .insert({ startup_id: st.id, investor_id: me.id, status: "active" }).select("id").single();
        if (error || !created) return NextResponse.json({ error: "Could not start conversation" }, { status: 500 });
        threadId = created.id;
      }
      if (openOnly) return NextResponse.json({ success: true, threadId });
      const { data: message, error: mErr } = await admin.from("messages").insert({ thread_id: threadId, sender_id: user.id, body }).select().single();
      if (mErr || !message) return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
      await admin.from("threads").update({ updated_at: message.created_at }).eq("id", threadId).then(undefined, () => {});
      if (st.owner_id && st.owner_id !== user.id) {
        const preview = body.slice(0, 60) + (body.length > 60 ? "…" : "");
        await notifyUser({ userId: st.owner_id, type: "message", title: `New message from ${myName}`, body: preview, href: `/dashboard/messages?thread=${threadId}` }).catch(() => {});
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
    const { data: message, error: mErr } = await admin.from("messages").insert({ thread_id: threadId, sender_id: user.id, body }).select().single();
    if (mErr || !message) return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    await admin.from("threads").update({ updated_at: message.created_at }).eq("id", threadId).then(undefined, () => {});

    if (other.owner_id && other.owner_id !== user.id) {
      const preview = body.slice(0, 60) + (body.length > 60 ? "…" : "");
      await notifyUser({ userId: other.owner_id, type: "message", title: `New message from ${me.name}`, body: preview, href: `/dashboard/messages?thread=${threadId}` }).catch(() => {});
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
  const { data: message, error: mErr } = await admin.from("messages").insert({ thread_id: threadId, sender_id: user.id, body }).select().single();
  if (mErr || !message) return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  await admin.from("threads").update({ updated_at: message.created_at }).eq("id", threadId).then(undefined, () => {});

  if (inv.owner_id && inv.owner_id !== user.id) {
    const preview = body.slice(0, 60) + (body.length > 60 ? "…" : "");
    await notifyUser({ userId: inv.owner_id, type: "message", title: `New message from ${st.name}`, body: preview, href: `/dashboard/messages?thread=${threadId}` }).catch(() => {});
    const { data: p } = await admin.from("profiles").select("email").eq("id", inv.owner_id).maybeSingle();
    if (p?.email) await sendNewMessageEmail(p.email, st.name, st.name, preview).catch(() => {});
  }
  return NextResponse.json({ success: true, threadId, startupId: st.id, investorId: inv.id });
}
