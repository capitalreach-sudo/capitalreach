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
  const saveSeries: number[] = Array(30).fill(0);
  const dealSeries: number[] = Array(30).fill(0);
  const raise = { softCircled: 0, committed: 0 };
  // B25: funnel — views → saves → deals → term sheets → closed.
  const funnel = { termSheets: 0, closed: 0 };

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

    // Rows rather than a head-count, for the same reason as pageviews above:
    // the created_at timestamps also feed the per-day sparkline, so one
    // query serves the number and the trend.
    const { data: saveRows } = await metrics
      .from("watchlists")
      .select("created_at")
      .eq("startup_id", startup.id)
      .limit(10000);
    savesCount = saveRows?.length || 0;
    for (const r of saveRows ?? []) {
      const idx = 29 - Math.floor((today.getTime() - new Date(r.created_at).setHours(0, 0, 0, 0)) / DAY);
      if (idx >= 0 && idx < 30) saveSeries[idx] += 1;
    }

    // Amounts double as the raise tracker: term-sheet deals count as
    // soft-circled, closed deals as committed. One query serves both the
    // active-deal count and the progress bar.
    const { data: dealRows } = await supabase
      .from("deals")
      .select("status, amount, created_at, commitment_type")
      .eq("startup_id", startup.id)
      .neq("status", "passed");
    dealsCount = dealRows?.length || 0;
    for (const d of dealRows ?? []) {
      const idx = 29 - Math.floor((today.getTime() - new Date(d.created_at).setHours(0, 0, 0, 0)) / DAY);
      if (idx >= 0 && idx < 30) dealSeries[idx] += 1;
    }
    // B17: the tracker reads commitment levels from day 0 — a soft-circle
    // or verbal yes at intro counts as soft-circled; a recorded commitment
    // or a closed deal counts as committed. Term sheets without an explicit
    // level still count as soft-circled.
    for (const d of dealRows ?? []) {
      if (d.status === "term_sheet" || d.status === "closed") funnel.termSheets += 1;
      if (d.status === "closed") funnel.closed += 1;
    }
    for (const d of dealRows ?? []) {
      const amt = d.amount ?? 0;
      if (d.status === "closed" || d.commitment_type === "committed") raise.committed += amt;
      else if (d.commitment_type === "soft_circle" || d.commitment_type === "verbal" || d.status === "term_sheet") raise.softCircled += amt;
    }
  }

  const { isLaunch } = await getLaunchStatus();

  // A rejection sends the listing back to 'draft' and stores the reason as an
  // admin action; the founder's notification carries it once, but the
  // dashboard should keep showing it until they resubmit. Latest reject note
  // that is newer than the last edit is the one still in force.
  let rejectionReason: string | null = null;
  if (startup && startup.status === "draft") {
    const { data: rej } = await createAdminClient()
      .from("admin_actions")
      .select("note, created_at")
      .eq("target_type", "startup").eq("target_id", startup.id).eq("action", "reject")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rej?.note && (!startup.updated_at || new Date(rej.created_at) >= new Date(startup.updated_at))) {
      rejectionReason = rej.note;
    }
  }

  return (
    <>
      <Navbar />
      <StartupDashboardClient
        profile={profile}
        startup={startup}
        analytics={{ views: viewsCount, saves: savesCount, deals: dealsCount, viewSeries, saveSeries, dealSeries, raise, funnel }}
        isLaunchMode={isLaunch}
        rejectionReason={rejectionReason}
      />
    </>
  );
}
