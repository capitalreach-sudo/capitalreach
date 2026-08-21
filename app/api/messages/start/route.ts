import { NextRequest, NextResponse } from "next/server";
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
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const investorId = typeof payload.investorId === "string" ? payload.investorId : "";
  const targetStartupId = typeof payload.startupId === "string" ? payload.startupId : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!isUuid(investorId) && !isUuid(targetStartupId)) return NextResponse.json({ error: "investorId or startupId required" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  if (body.length > 2000) return NextResponse.json({ error: "Message is too long (max 2000 characters)" }, { status: 400 });

  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "Founders only" }, { status: 403 });

  const admin = createAdminClient();

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
