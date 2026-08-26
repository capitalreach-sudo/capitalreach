import { createServerSupabaseClient } from "@/lib/supabase-server";
import { MessagesClient } from "@/components/dashboard/messages-client";
import { Navbar } from "@/components/shared/navbar";
import { redirect } from "next/navigation";

export default async function MessagesPage() {
  let profile: any = null;
  let threads: any[] = [];
  let myStartupId: string | null = null;
  let myInvestorId: string | null = null;

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
  } catch {
    // DB not connected — redirect to login
    redirect("/auth/login?redirect=/dashboard/messages");
  }

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
      <Navbar />
      <MessagesClient profile={profile} threads={threads} myStartupId={myStartupId} myInvestorId={myInvestorId} unreadThreadIds={unreadThreadIds} />
    </>
  );
}
