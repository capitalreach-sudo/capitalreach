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
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isAccountSuspended(user.id)) return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const investorId = typeof payload.investorId === "string" ? payload.investorId : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!isUuid(investorId)) return NextResponse.json({ error: "investorId required" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  if (body.length > 2000) return NextResponse.json({ error: "Message is too long (max 2000 characters)" }, { status: 400 });

  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "Founders only" }, { status: 403 });

  const admin = createAdminClient();
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
