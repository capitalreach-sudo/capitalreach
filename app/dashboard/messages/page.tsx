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

    if (profile.role === "startup") {
      const { data: startup } = await supabase
        .from("startups")
        .select("id")
        .eq("owner_id", user.id)
        .single();
      if (startup) {
        myStartupId = startup.id;
        const { data } = await supabase
          .from("threads")
          .select("*, investor:investors!threads_investor_id_fkey(slug, type, display_name, firm_name), startup:startups!threads_startup_id_fkey(name, slug), recipient_startup:startups!threads_recipient_startup_id_fkey(name, slug)")
          .or(`startup_id.eq.${startup.id},recipient_startup_id.eq.${startup.id}`)
          .order("updated_at", { ascending: false });
        threads = data || [];
      }
    } else if (profile.role === "investor") {
      const { data: investor } = await supabase
        .from("investors")
        .select("id")
        .eq("owner_id", user.id)
        .single();
      if (investor) {
        myInvestorId = investor.id;
        const { data } = await supabase
          .from("threads")
          .select("*, investor:investors!threads_investor_id_fkey(slug, type, display_name, firm_name), recipient_investor:investors!threads_recipient_investor_id_fkey(slug, type, display_name, firm_name), startup:startups!threads_startup_id_fkey(name, slug)")
          // C32: an investor is a participant either as the deal-side
          // investor or as the recipient of a co-investor share.
          .or(`investor_id.eq.${investor.id},recipient_investor_id.eq.${investor.id}`)
          .order("updated_at", { ascending: false });
        threads = data || [];
      }
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
