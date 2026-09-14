import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { notifyUser } from "@/lib/notify-user";
import { maskFreeText } from "@/lib/message-safety";
import { isUuid } from "@/lib/utils";

/**
 * C31: share a listing with another investor.
 *
 * A share is a record (startup_shares) and a notification to the recipient,
 * with an optional note carried on both. It does not open a conversation:
 * messaging exists only between the two parties of a sealed deal, and two
 * investors can never have one. An admin sender still gets the pair's direct
 * thread with the note in it, since admins keep full messaging for support.
 *
 * POST { startupId, toInvestorId, note? }
 * GET  → shares sent to me and by me
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId, toInvestorId, note } = await req.json().catch(() => ({}));
  if (!isUuid(startupId) || !isUuid(toInvestorId)) {
    return NextResponse.json({ error: "startupId and toInvestorId required" }, { status: 400 });
  }
  const rawNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 2000) : null;

  const admin = createAdminClient();
  const [{ data: me }, { data: to }, { data: startup }, { data: senderProfile }] = await Promise.all([
    admin.from("investors").select("id, display_name, firm_name").eq("owner_id", user.id).maybeSingle(),
    admin.from("investors").select("id, owner_id, display_name").eq("id", toInvestorId).maybeSingle(),
    admin.from("startups").select("id, name, slug, status").eq("id", startupId).maybeSingle(),
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  if (!me) return NextResponse.json({ error: "Investors only" }, { status: 403 });
  if (!to?.owner_id || !startup || startup.status !== "active") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (to.owner_id === user.id) return NextResponse.json({ error: "That's you" }, { status: 400 });

  // The note reaches the recipient's notification and their shared-with-you
  // panel, so it is masked like a message.
  const message = rawNote
    ? (await maskFreeText({
        text: rawNote,
        surface: "deal_share",
        subjectType: "investor",
        subjectId: me.id,
        counterpartyId: to.id,
      })).text
    : null;

  let threadId: string | null = null;
  if (senderProfile?.role === "admin") {
    // The pair's direct thread, one per pair in either direction (unique
    // index from 106).
    //
    // It carries NO startup anchor, and that is load bearing. A thread holding
    // (startup_id, investor_id) is indistinguishable from the founder/investor
    // thread for that pair, and (startup_id, investor_id) is how every lookup
    // on the platform finds a conversation -- /api/messages/send and start,
    // deal registration's message count, the close route's amount check.
    // Which listing was shared is recorded on startup_shares below.
    const pair = `and(investor_id.eq.${me.id},recipient_investor_id.eq.${to.id}),and(investor_id.eq.${to.id},recipient_investor_id.eq.${me.id})`;
    const findPairThread = async () => {
      const { data } = await admin
        .from("threads").select("id")
        .is("startup_id", null).or(pair)
        .limit(1).maybeSingle();
      return data?.id ?? null;
    };
    threadId = await findPairThread();
    if (!threadId) {
      const { data: created } = await admin
        .from("threads")
        .insert({ investor_id: me.id, recipient_investor_id: to.id, status: "active" })
        .select("id").single();
      // 23505: a concurrent request opened the pair's thread between the two
      // calls, so an empty `created` is recoverable exactly when the lookup
      // now finds theirs. Any other insert failure leaves nothing to attach
      // the note to, and answering shared:true there would tell the sender
      // their message went somewhere it never went.
      threadId = created?.id ?? await findPairThread();
      if (!threadId) return NextResponse.json({ error: "Could not start conversation" }, { status: 500 });
    }
    if (message) {
      const { error: msgError } = await admin.from("messages").insert({ thread_id: threadId, sender_id: user.id, body: message });
      if (msgError) return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
      await admin.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId).then(undefined, () => {});
    }
  }

  const { error } = await admin.from("startup_shares").upsert(
    { startup_id: startup.id, from_investor_id: me.id, to_investor_id: to.id, note: message, thread_id: threadId },
    { onConflict: "startup_id,from_investor_id,to_investor_id" },
  );
  if (error) return NextResponse.json({ error: "Could not record the share" }, { status: 500 });

  await notifyUser({
    userId: to.owner_id,
    type: "deal_shared",
    title: `${me.display_name ?? me.firm_name ?? "An investor"} shared ${startup.name} with you`,
    body: message ? message.slice(0, 140) : null,
    href: `/startups/${startup.slug}`,
  });
  return NextResponse.json({ shared: true, threadId });
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("investors").select("id").eq("owner_id", user.id).maybeSingle();
  if (!me) return NextResponse.json({ received: [], sent: [] });

  const [{ data: received }, { data: sent }] = await Promise.all([
    admin.from("startup_shares")
      .select("id, note, created_at, thread_id, startup:startups(name, slug), from_investor:investors!startup_shares_from_investor_id_fkey(slug, display_name, firm_name)")
      .eq("to_investor_id", me.id).order("created_at", { ascending: false }).limit(50),
    admin.from("startup_shares")
      .select("id, note, created_at, thread_id, startup:startups(name, slug), to_investor:investors!startup_shares_to_investor_id_fkey(slug, display_name, firm_name)")
      .eq("from_investor_id", me.id).order("created_at", { ascending: false }).limit(50),
  ]);
  return NextResponse.json({ received: received ?? [], sent: sent ?? [] });
}
