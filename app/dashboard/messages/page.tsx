import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { MessagesClient } from "@/components/dashboard/messages-client";
import { Navbar } from "@/components/shared/navbar";
import { redirect } from "next/navigation";
import { messagingAccess, pairKey, threadOpenFor, type ViewerEntities } from "@/lib/messaging-access";
import { isUuid } from "@/lib/utils";

/**
 * A member has Messages only once a deal they are party to is sealed, and only
 * with that deal's counterpart (lib/messaging-access). This page enforces it on
 * the server, independently of the hidden links: a member with no sealed deal
 * is sent to /deals, and a member with one is shown only the threads of their
 * sealed pairs, never a peer thread (founder to founder, investor to investor)
 * and never a pair thread whose deal is unsealed, however old. Admins see every
 * thread they are party to.
 */

type SearchParams = { startupId?: string | string[]; investorId?: string | string[] };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The pair's thread, created if its conversation has not been started yet. The
 * caller has already established that the pair is sealed and that the viewer
 * is party to it.
 */
async function ensurePairThread(startupId: string, investorId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("threads").select("id")
    .match({ startup_id: startupId, investor_id: investorId })
    .is("recipient_startup_id", null)
    .is("recipient_investor_id", null)
    .limit(1).maybeSingle();
  if (existing) return;
  // A concurrent open of the same pair can win this insert; the thread it
  // created is the one listed below, so a failed insert needs nothing more.
  await admin.from("threads").insert({ startup_id: startupId, investor_id: investorId, status: "active" });
}

export default async function MessagesPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  let profile: any = null;
  let threads: any[] = [];
  let myStartupId: string | null = null;
  let myInvestorId: string | null = null;
  // Decided inside the try and acted on after it: redirect() throws, and the
  // catch below would turn this redirect into a login one.
  let sendTo: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth/login?redirect=/dashboard/messages");
    }

    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = p;

    if (!profile) {
      redirect("/auth/login?redirect=/dashboard/messages");
    }

    const access = await messagingAccess(user.id);
    const isAdmin = access.admin || profile.role === "admin";
    const sealed = new Set(access.pairs.map((pair) => pairKey(pair.startupId, pair.investorId)));
    // An admin-authored thread (support outreach, a shared listing with a
    // note) has no sealed pair behind it, so a member can have Messages
    // through this alone -- the emptiness check below waits for the thread
    // fetch instead of deciding on `sealed` alone.
    const viewer: ViewerEntities = {
      startupIds: new Set(access.entities.startupIds),
      investorIds: new Set(access.entities.investorIds),
    };

    if (!isAdmin) {
      // ?startupId=&investorId= opens a sealed pair's conversation from its
      // deal, creating the thread on first use. For a member it must name a
      // pair they sealed, or it opens nothing.
      const startupParam = first(searchParams.startupId);
      const investorParam = first(searchParams.investorId);
      if (startupParam !== undefined || investorParam !== undefined) {
        if (isUuid(startupParam) && isUuid(investorParam) && sealed.has(pairKey(startupParam, investorParam))) {
          await ensurePairThread(startupParam, investorParam);
        } else {
          sendTo = "/deals";
        }
      }
    }

    if (!sendTo) {
      // Threads by ENTITY OWNERSHIP, not by role. The old role branches left
      // two classes of people staring at an empty inbox: admins who also own
      // an entity (their sent conversations never listed), and anyone owning
      // both kinds of profile. One query, all four participant columns.
      const [{ data: myStartups }, { data: myInvestors }] = await Promise.all([
        supabase.from("startups").select("id").eq("owner_id", user.id).limit(1),
        supabase.from("investors").select("id").eq("owner_id", user.id).limit(1),
      ]);
      myStartupId = myStartups?.[0]?.id ?? null;
      myInvestorId = myInvestors?.[0]?.id ?? null;

      const ors: string[] = [];
      if (myStartupId) ors.push(`startup_id.eq.${myStartupId}`, `recipient_startup_id.eq.${myStartupId}`);
      if (myInvestorId) ors.push(`investor_id.eq.${myInvestorId}`, `recipient_investor_id.eq.${myInvestorId}`);
      if (ors.length) {
        const { data } = await supabase
          .from("threads")
          .select("*, investor:investors!threads_investor_id_fkey(slug, type, display_name, firm_name), recipient_investor:investors!threads_recipient_investor_id_fkey(slug, type, display_name, firm_name), startup:startups!threads_startup_id_fkey(name, slug), recipient_startup:startups!threads_recipient_startup_id_fkey(name, slug)")
          .or(ors.join(","))
          .order("updated_at", { ascending: false });
        threads = data || [];
      }
      if (!isAdmin) threads = threads.filter((th) => threadOpenFor(th, sealed, viewer));
    }

    // Nothing sealed and nothing an admin sent them: a member here has no
    // reason to be, whether they arrived by a link or the nav item.
    if (!sendTo && !isAdmin && sealed.size === 0 && threads.length === 0) {
      sendTo = "/deals";
    }
  } catch {
    // DB not connected: redirect to login
    redirect("/auth/login?redirect=/dashboard/messages");
  }

  if (sendTo) redirect(sendTo);

  // Which threads hold messages the other side sent that this user hasn't
  // read -- the dot on the thread list. One grouped query, not per-thread.
  let unreadThreadIds: string[] = [];
  if (threads.length && profile) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data: unreadRows } = await supabase
        .from("messages")
        .select("thread_id")
        .in("thread_id", threads.map((th) => th.id))
        .neq("sender_id", profile.id)
        .is("read_at", null);
      unreadThreadIds = Array.from(new Set((unreadRows ?? []).map((r) => r.thread_id)));
    } catch { /* dot-less list beats a broken page */ }
  }

  return (
    <>
      {/* Seeded so SSR paints the signed-in bar; this page already proved
          the session and holds the profile. */}
      <Navbar initialProfile={profile} />
      <MessagesClient profile={profile} threads={threads} myStartupId={myStartupId} myInvestorId={myInvestorId} unreadThreadIds={unreadThreadIds} />
    </>
  );
}
