import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { buildAccessContext, founderCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";

/**
 * Which investors viewed this founder's startup in the last 30 days.
 *
 * Companion to /api/startups/savers, same shape and same gate: every plan
 * gets the count (that's what sells the upgrade), seeInvestorIdentity gets
 * names. startup_views records one row per investor per day (unique index),
 * so rows here are view-days; they are collapsed to distinct investors with
 * their most recent visit.
 *
 * Service role for the same reason as savers: startup_views RLS is scoped to
 * the viewing investor, not the viewed startup. Ownership is checked here.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, subscription_tier, suspended, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "startup") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: startup } = await admin
    .from("startups")
    .select("id, subscription_tier")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!startup) return NextResponse.json({ viewers: [], count: 0, locked: false });

  const { isLaunch } = await getLaunchStatus();
  const ctx = buildAccessContext({ ...profile, subscription_tier: startup.subscription_tier }, isLaunch);
  const canSeeWho = founderCan(ctx).seeInvestorIdentity;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await admin
    .from("startup_views")
    .select("viewed_at, investor:investors(slug, display_name, firm_name, type, is_public, is_external)")
    .eq("startup_id", startup.id)
    .gte("viewed_at", thirtyDaysAgo)
    .order("viewed_at", { ascending: false })
    .limit(200);

  // Collapse view-days to distinct investors, newest visit kept (rows are
  // already newest-first).
  const seen = new Map<string, { slug: string; name: string | null; firm: string | null; type: string | null; lastViewedAt: string }>();
  for (const r of (rows ?? []) as any[]) {
    // Private / off-platform investors are counted but never named.
    if (!r.investor?.is_public || r.investor?.is_external) continue;
    const slug = r.investor?.slug;
    if (!slug || seen.has(slug)) continue;
    seen.set(slug, {
      slug,
      name: r.investor?.display_name ?? r.investor?.firm_name ?? null,
      firm: r.investor?.firm_name ?? null,
      type: r.investor?.type ?? null,
      lastViewedAt: r.viewed_at,
    });
  }
  const distinct = Array.from(seen.values());

  if (!canSeeWho) {
    return NextResponse.json({ viewers: [], count: distinct.length, locked: true });
  }

  return NextResponse.json({ viewers: distinct.slice(0, 50), count: distinct.length, locked: false });
}
