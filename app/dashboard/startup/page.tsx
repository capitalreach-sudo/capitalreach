import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import type { Profile, Startup } from "@/types";
import { StartupDashboardClient } from "@/components/dashboard/startup-dashboard-client";
import { Navbar } from "@/components/shared/navbar";
import { getLaunchStatus } from "@/lib/launchMode";
import { computeBenchmarks, type BenchmarkResult } from "@/lib/benchmarks";

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

  // Owner verified above; the service role sees past the column grants.
  const { data: startup } = await createAdminClient()
    .from("startups")
    .select(`
      *,
      founders:startup_founders(*),
      documents:startup_documents(*),
      milestones:startup_milestones(*)
    `)
    .eq("owner_id", user.id)
    // "active" sorts before "pending_review": if duplicates ever exist again,
    // the live listing wins and the dashboard still renders.
    .order("status", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
    .returns<Startup>();

  // Analytics: pageviews over the 30 calendar days the dashboard's sentence
  // promises. The window opens on a day boundary, not on a rolling instant,
  // which pulled part of a 31st day into the number.
  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() - 29);
  const thirtyDaysAgo = windowStart.toISOString();
  let viewsCount = 0, savesCount = 0, dealsCount = 0;
  const raise = { softCircled: 0, committed: 0 };

  if (startup) {
    // These three counts are about the founder's own listing, but two of them
    // read tables whose RLS is scoped to the *other* party: watchlists is keyed
    // on investor_id and pageviews on the viewer. Through the RLS client a
    // founder therefore counted zero of their own saves and views no matter how
    // many existed -- the metrics were permanently stuck at 0 rather than
    // merely empty. Counting through the service role fixes that; only
    // aggregates are read, never who saved or who viewed.
    const metrics = createAdminClient();

    // ONE definition of this figure, and the dashboard words it: visits in the
    // 30-day window above. startups.pageviews is a lifetime counter and would
    // contradict that sentence, and an all-time count next to a 30-day one is
    // what let two earlier versions of this page disagree with each other.
    const { data: viewRows } = await metrics
      .from("pageviews")
      .select("created_at")
      .eq("startup_id", startup.id)
      .gte("created_at", thirtyDaysAgo)
      .limit(10000);
    viewsCount = viewRows?.length || 0;

    // Saves are all-time, and the dashboard says "saves" without a window.
    const { data: saveRows } = await metrics
      .from("watchlists")
      .select("created_at")
      .eq("startup_id", startup.id)
      .limit(10000);
    savesCount = saveRows?.length || 0;

    // Amounts double as the raise tracker: term-sheet deals count as
    // soft-circled, closed deals as committed. One query serves both the
    // active-deal count and the progress bar.
    const { data: dealRows } = await supabase
      .from("deals")
      .select("status, amount, created_at, commitment_type")
      .eq("startup_id", startup.id)
      .neq("status", "passed");
    // "Deals in progress" means not yet finalised, so closed deals stay in
    // dealRows for the raise figure but are not counted here -- the same
    // definition the investor dashboard uses, which this number once
    // contradicted.
    dealsCount = (dealRows ?? []).filter((d) => d.status !== "closed").length;
    // B17: the round figure reads commitment levels from day 0. A soft-circle
    // or verbal yes at intro counts as soft-circled; a recorded commitment or
    // a closed deal counts as committed. Term sheets without an explicit level
    // still count as soft-circled.
    for (const d of dealRows ?? []) {
      const amt = d.amount ?? 0;
      if (d.status === "closed" || d.commitment_type === "committed") raise.committed += amt;
      else if (d.commitment_type === "soft_circle" || d.commitment_type === "verbal" || d.status === "term_sheet") raise.softCircled += amt;
    }
  }

  // F10: where this round stands against its peers. Cohort = other ACTIVE
  // listings at the same stage, the comparison a seed investor actually
  // makes. Percentiles only; nothing about any individual peer leaves here.
  let benchmarks: BenchmarkResult | null = null;
  if (startup && startup.status === "active" && startup.stage) {
    const { data: cohort } = await createAdminClient()
      .from("startups")
      .select("mrr, growth_rate, runway_months, vaultrise_score")
      .eq("status", "active")
      .eq("stage", startup.stage)
      .neq("id", startup.id)
      .limit(500);
    benchmarks = computeBenchmarks(
      { mrr: startup.mrr, growth_rate: startup.growth_rate, runway_months: startup.runway_months, vaultrise_score: startup.vaultrise_score },
      cohort ?? [],
    );
    if (benchmarks.entries.length === 0) benchmarks = null;
  }

  const { isLaunch } = await getLaunchStatus();

  // A rejection sends the listing back to 'draft' and stores the reason as an
  // admin action; the founder's notification carries it once, but the
  // dashboard should keep showing it until they resubmit. Latest reject note
  // that is newer than the last edit is the one still in force.
  let rejectionReason: string | null = null;
  if (startup && startup.status === "draft") {
    // BOTH rejection paths: the quick reject writes `note`, the checklist
    // review bench logs review_rejected / review_changes_requested with the
    // founder-facing sentence in details.note_to_subject.
    const { data: rej } = await createAdminClient()
      .from("admin_actions")
      .select("note, details, created_at")
      .eq("target_type", "startup").eq("target_id", startup.id)
      .in("action", ["reject", "review_rejected", "review_changes_requested"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const rejNote = rej?.note
      ?? (rej?.details as { note_to_subject?: string | null } | null)?.note_to_subject
      ?? null;
    if (rejNote && (!startup.updated_at || new Date(rej!.created_at) >= new Date(startup.updated_at))) {
      rejectionReason = rejNote;
    }
  }

  // A closed round with no closure declaration is the moment the platform's
  // fee either gets claimed or quietly leaks -- and the page built for it had
  // no inbound link. The save-time redirect covers the moment of closing;
  // this standing flag covers the founder who navigated away first.
  let needsClosureDeclaration = false;
  if (startup && (startup as { round_state?: string | null }).round_state === "closed") {
    const { data: declared } = await createAdminClient()
      .from("round_closures")
      .select("id")
      .eq("startup_id", startup.id)
      .limit(1)
      .maybeSingle();
    needsClosureDeclaration = !declared;
  }

  return (
    <>
      {/* Seeded so SSR paints the signed-in bar; this page already proved
          the session and holds the profile. */}
      <Navbar initialProfile={profile} />
      <StartupDashboardClient
        profile={profile}
        startup={startup}
        analytics={{ views: viewsCount, saves: savesCount, deals: dealsCount, raise }}
        isLaunchMode={isLaunch}
        rejectionReason={rejectionReason}
        needsClosureDeclaration={needsClosureDeclaration}
        benchmarks={benchmarks}
      />
    </>
  );
}
