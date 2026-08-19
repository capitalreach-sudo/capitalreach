import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * C31 + C32: share a listing with another investor. This used to be a
 * notification with a note that was passed in and thrown away — nothing
 * existed afterwards for either side.
 *
 * A share is now a record (startup_shares) AND it opens an investor↔
 * investor thread about that company, so "let's look at this together"
 * has somewhere to continue. The note becomes the first message.
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
  const message = typeof note === "string" && note.trim() ? note.trim().slice(0, 2000) : null;

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

  // The thread the two of them can keep talking in (C32). One per pair per
  // company, in either direction.
  const { data: existingThread } = await admin
    .from("threads")
    .select("id")
    .eq("startup_id", startup.id)
    .not("recipient_investor_id", "is", null)
    .or(`and(investor_id.eq.${me.id},recipient_investor_id.eq.${to.id}),and(investor_id.eq.${to.id},recipient_investor_id.eq.${me.id})`)
    .maybeSingle();
  let threadId = existingThread?.id ?? null;
  if (!threadId) {
    const { data: created } = await admin
      .from("threads")
      .insert({ startup_id: startup.id, investor_id: me.id, recipient_investor_id: to.id, status: "active" })
      .select("id").single();
    threadId = created?.id ?? null;
  }
  if (threadId && message) {
    await admin.from("messages").insert({ thread_id: threadId, sender_id: user.id, body: message }).then(undefined, () => {});
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
