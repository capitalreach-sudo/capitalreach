import { createServerSupabaseClient } from "@/lib/supabase-server";
import { AdminClient } from "@/components/admin/admin-client";
import type { Profile, Startup, Investor, Deal } from "@/types";
import { Navbar } from "@/components/shared/navbar";
import { AdminPulse, type PulseMetric, type HealthListing, type AdminAction } from "@/components/admin/admin-pulse";
import { SystemHealth, type SystemEvent } from "@/components/admin/system-health";

// The exact embed shapes AdminClient's props declare; asserting them here is
// licensed by the DB CHECK constraints (unions) and NOT NULL owner FKs (embeds).
type AdminStartup  = Startup  & { owner: { email: string; full_name: string } };
type AdminInvestor = Investor & { owner: { email: string; full_name: string; subscription_tier: string } };
type AdminDeal     = Deal     & { startup: { name: string }; investor: { slug: string } };

// Two seven-day windows, so every pulse metric is "this week vs the one
// before" rather than a total that only ever grows.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const now = Date.now();
  const weekAgo = new Date(now - WEEK_MS).toISOString();
  const twoWeeksAgo = new Date(now - 2 * WEEK_MS).toISOString();

  // head:true — these are counts, so no rows cross the wire. The table name is
  // the literal union rather than string: the client is typed against the
  // generated schema, so a renamed table breaks the build here instead of
  // returning a silent zero on the dashboard.
  const countIn = (table: "profiles" | "startups" | "deals", col: string, from: string, to?: string) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true }).gte(col, from);
    if (to) q = q.lt(col, to);
    return q;
  };

  // Middleware already guards this — fetch all data
  const [
    { data: pendingStartups },
    { data: allStartups },
    { data: allInvestors },
    { data: allDeals },
    { count: startupCount },
    { count: investorCount },
  ] = await Promise.all([
    supabase.from("startups").select("*, owner:profiles(email, full_name)").eq("status", "pending_review").order("created_at", { ascending: false }).returns<AdminStartup[]>(),
    supabase.from("startups").select("*, owner:profiles(email, full_name)").order("created_at", { ascending: false }).limit(50).returns<AdminStartup[]>(),
    supabase.from("investors").select("*, owner:profiles(email, full_name, subscription_tier)").order("created_at", { ascending: false }).limit(50).returns<AdminInvestor[]>(),
    supabase.from("deals").select("*, startup:startups(name), investor:investors(slug)").order("updated_at", { ascending: false }).limit(50).returns<AdminDeal[]>(),
    supabase.from("startups").select("*", { count: "exact", head: true }),
    supabase.from("investors").select("*", { count: "exact", head: true }),
  ]);

  // Pulse + listing health. Separate from the block above because these are
  // aggregate counts and a differently-shaped listing row, not the same rows
  // sliced again.
  const [
    { count: signupsNow }, { count: signupsPrev },
    { count: listingsNow }, { count: listingsPrev },
    { count: dealsNow }, { count: dealsPrev },
    { count: closedNow }, { count: closedPrev },
    { data: healthRows },
    { data: adminActions },
    { data: systemEvents },
  ] = await Promise.all([
    countIn("profiles", "created_at", weekAgo),
    countIn("profiles", "created_at", twoWeeksAgo, weekAgo),
    countIn("startups", "created_at", weekAgo),
    countIn("startups", "created_at", twoWeeksAgo, weekAgo),
    countIn("deals", "created_at", weekAgo),
    countIn("deals", "created_at", twoWeeksAgo, weekAgo),
    supabase.from("deals").select("*", { count: "exact", head: true }).eq("status", "closed").gte("updated_at", weekAgo),
    supabase.from("deals").select("*", { count: "exact", head: true }).eq("status", "closed").gte("updated_at", twoWeeksAgo).lt("updated_at", weekAgo),
    // Aliased embeds so the rows satisfy listingCompleteness's input shape
    // directly -- the same model the founder dashboard scores itself with, so
    // admin and founder can never disagree about how finished a listing is.
    supabase
      .from("startups")
      .select(`
        id, name, slug, updated_at, pageviews, tagline, problem, solution, market,
        competitive_advantage, use_of_funds, website, funding_target, equity_offered,
        min_check_size, booking_url, mrr, arr, paying_customers, user_count,
        founders:startup_founders(linkedin_url),
        documents:startup_documents(id),
        milestones:startup_milestones(id)
      `)
      .eq("status", "active")
      .order("updated_at", { ascending: true })
      .limit(50)
      .returns<HealthListing[]>(),
    // The audit trail these routes have been writing since week one, finally
    // read by something. admin is a nullable embed: an action whose admin was
    // later deleted must still appear, attributed to nobody, rather than
    // vanish from the log it exists to preserve.
    supabase
      .from("admin_actions")
      .select("id, action, target_type, note, created_at, admin:profiles!admin_actions_admin_id_fkey(email, full_name)")
      .order("created_at", { ascending: false })
      .limit(12)
      .returns<AdminAction[]>(),
    // Newest 100 events: enough to show every recent error and each source's
    // latest heartbeat without paging.
    supabase
      .from("system_events")
      .select("id, source, level, message, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<SystemEvent[]>(),
  ]);

  const pulse: PulseMetric[] = [
    { key: "signups",  labelKey: "pulse.signups",  now: signupsNow  ?? 0, prev: signupsPrev  ?? 0 },
    { key: "listings", labelKey: "pulse.listings", now: listingsNow ?? 0, prev: listingsPrev ?? 0 },
    { key: "deals",    labelKey: "pulse.deals",    now: dealsNow    ?? 0, prev: dealsPrev    ?? 0 },
    { key: "closed",   labelKey: "pulse.closed",   now: closedNow   ?? 0, prev: closedPrev   ?? 0 },
  ];

  // Revenue approximation (in real app, query Stripe)
  const tierPrices: Record<string, number> = {
    starter: 29,
    growth: 79,
    angel: 99,
    pro_investor: 249,
    pro: 249,
    institution: 0,
    institutional: 0,
  };
  const startupMrr = (allStartups || []).reduce((sum, s) => sum + (tierPrices[s.subscription_tier] || 0), 0);
  const investorMrr = (allInvestors || []).reduce((sum, i) => sum + (tierPrices[i.subscription_tier] || 0), 0);

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "28px 24px 0" }}>
        <SystemHealth
          events={systemEvents ?? []}
          knownSources={["cron/follow-ups"]}
        />
        <AdminPulse metrics={pulse} listings={healthRows ?? []} actions={adminActions ?? []} />
      </div>
      <AdminClient
        pendingStartups={pendingStartups ?? []}
        allStartups={allStartups ?? []}
        allInvestors={allInvestors ?? []}
        allDeals={allDeals ?? []}
        stats={{
          totalStartups: startupCount || 0,
          totalInvestors: investorCount || 0,
          startupMrr,
          investorMrr,
        }}
      />
    </>
  );
}
