import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { notifyUser } from "@/lib/notify-user";
import { maskFreeText } from "@/lib/message-safety";
import { isUuid } from "@/lib/utils";

/**
 * C31 + C32: share a listing with another investor. This used to be a
 * notification with a note that was passed in and thrown away — nothing
 * existed afterwards for either side.
 *
 * A share is now a record (startup_shares) AND it opens an investor↔
 * investor thread with the recipient, so "let's look at this together"
 * has somewhere to continue. The note becomes the first message; which
 * company it was about is the share record's job, not the thread's.
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
  const [{ data: me }, { data: to }, { data: startup }] = await Promise.all([
    admin.from("investors").select("id, display_name, firm_name").eq("owner_id", user.id).maybeSingle(),
    admin.from("investors").select("id, owner_id, display_name").eq("id", toInvestorId).maybeSingle(),
    admin.from("startups").select("id, name, slug, status").eq("id", startupId).maybeSingle(),
  ]);
  if (!me) return NextResponse.json({ error: "Investors only" }, { status: 403 });
  if (!to?.owner_id || !startup || startup.status !== "active") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (to.owner_id === user.id) return NextResponse.json({ error: "That's you" }, { status: 400 });

  // Investor to investor is deliberately not gated on an offer, but the note
  // still becomes a message and an email, so it is masked like one.
  const message = rawNote
    ? (await maskFreeText({
        text: rawNote,
        surface: "deal_share",
        subjectType: "investor",
        subjectId: me.id,
        counterpartyId: to.id,
      })).text
    : null;

  // The thread the two of them can keep talking in (C32): the pair's direct
  // thread, one per pair in either direction (unique index from 106).
  //
  // It carries NO startup anchor, and that is load bearing. A thread holding
  // (startup_id, investor_id) is indistinguishable from the founder/investor
  // thread for that pair, and (startup_id, investor_id) is how every lookup on
  // the platform finds a conversation -- /api/messages/send and start, deal
  // registration's message count, the close route's amount check. Anchoring
  // this one fed a founder's message into a co-investor thread, where
  // /api/messages/reply refuses the founder (two investors are its only
  // parties) and the other investor reads what was meant for the company.
  // Which listing was shared is recorded on startup_shares below.
  const pair = `and(investor_id.eq.${me.id},recipient_investor_id.eq.${to.id}),and(investor_id.eq.${to.id},recipient_investor_id.eq.${me.id})`;
  const findPairThread = async () => {
    const { data } = await admin
      .from("threads").select("id")
      .is("startup_id", null).or(pair)
      .limit(1).maybeSingle();
    return data?.id ?? null;
  };
  let threadId = await findPairThread();
  if (!threadId) {
    const { data: created } = await admin
      .from("threads")
      .insert({ investor_id: me.id, recipient_investor_id: to.id, status: "active" })
      .select("id").single();
    // 23505: a concurrent share, or the other investor pressing "message" on
    // this one's profile, opened the pair's thread between the two calls -- so
    // an empty `created` is recoverable exactly when the lookup now finds
    // theirs. Any other insert failure leaves nothing to attach the note to,
    // and answering shared:true there tells the sender their message went
    // somewhere it never went.
    threadId = created?.id ?? await findPairThread();
    if (!threadId) return NextResponse.json({ error: "Could not start conversation" }, { status: 500 });
  }
  if (message) {
    const { error: msgError } = await admin.from("messages").insert({ thread_id: threadId, sender_id: user.id, body: message });
    if (msgError) return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    await admin.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId).then(undefined, () => {});
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
