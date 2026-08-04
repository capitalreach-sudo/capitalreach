import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import type { Profile, Startup } from "@/types";
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
    .single()
    // Union narrowings below are licensed by the DB CHECK constraints.
    .returns<Profile>();

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
    .single()
    .returns<Startup>();

  // Analytics: pageviews last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let viewsCount = 0, savesCount = 0, dealsCount = 0;
  const viewSeries: number[] = Array(30).fill(0);

  if (startup) {
    // These three counts are about the founder's own listing, but two of them
    // read tables whose RLS is scoped to the *other* party: watchlists is keyed
    // on investor_id and pageviews on the viewer. Through the RLS client a
    // founder therefore counted zero of their own saves and views no matter how
    // many existed -- the metrics were permanently stuck at 0 rather than
    // merely empty. Counting through the service role fixes that; only
    // aggregates are read, never who saved or who viewed.
    const metrics = createAdminClient();

    // Timestamps rather than a head-count: the same rows also feed the
    // per-day sparkline, so one query serves both numbers.
    const { data: viewRows } = await metrics
      .from("pageviews")
      .select("created_at")
      .eq("startup_id", startup.id)
      .gte("created_at", thirtyDaysAgo)
      .limit(10000);
    viewsCount = viewRows?.length || 0;
    const DAY = 24 * 60 * 60 * 1000;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const r of viewRows ?? []) {
      const idx = 29 - Math.floor((today.getTime() - new Date(r.created_at).setHours(0, 0, 0, 0)) / DAY);
      if (idx >= 0 && idx < 30) viewSeries[idx] += 1;
    }

    const { count: saves } = await metrics
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
        profile={profile}
        startup={startup}
        analytics={{ views: viewsCount, saves: savesCount, deals: dealsCount, viewSeries }}
        isLaunchMode={isLaunch}
      />
    </>
  );
}
