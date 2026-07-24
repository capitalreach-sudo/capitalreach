import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { StartupDashboardClient } from "@/components/dashboard/startup-dashboard-client";
import { Navbar } from "@/components/shared/navbar";
import { getLaunchStatus } from "@/lib/launchMode";

export default async function StartupDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "startup") redirect("/dashboard/investor");

  const { data: startup } = await supabase
    .from("startups")
    .select(`
      *,
      founders:startup_founders(*),
      documents:startup_documents(*),
      milestones:startup_milestones(*)
    `)
    .eq("owner_id", user.id)
    .single();

  // Analytics: pageviews last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let viewsCount = 0, savesCount = 0, dealsCount = 0;

  if (startup) {
    const { count: views } = await supabase
      .from("pageviews")
      .select("*", { count: "exact", head: true })
      .eq("startup_id", startup.id)
      .gte("created_at", thirtyDaysAgo);
    viewsCount = views || 0;

    const { count: saves } = await supabase
      .from("watchlists")
      .select("*", { count: "exact", head: true })
      .eq("startup_id", startup.id);
    savesCount = saves || 0;

    const { count: deals } = await supabase
      .from("deals")
      .select("*", { count: "exact", head: true })
      .eq("startup_id", startup.id)
      .neq("status", "passed");
    dealsCount = deals || 0;
  }

  const { isLaunch } = await getLaunchStatus();

  return (
    <>
      <Navbar />
      <StartupDashboardClient
        profile={profile as any}
        startup={startup as any}
        analytics={{ views: viewsCount, saves: savesCount, deals: dealsCount }}
        isLaunchMode={isLaunch}
      />
    </>
  );
}
