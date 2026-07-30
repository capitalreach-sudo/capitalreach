import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { buildAccessContext, founderCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";

/**
 * Which investors have saved this founder's startup.
 *
 * The founder dashboard could already show a *count* of saves, but not who --
 * and `seeInvestorIdentity` has existed as a plan capability, with an
 * "Upgrade to see who" string sitting in all fifteen locale files, behind no
 * actual feature. This is that feature.
 *
 * Reads through the service role deliberately: watchlists RLS is scoped to
 * investor_id, so a founder cannot see rows about their own startup. Ownership
 * is checked here instead, and only investors who have made their profile
 * public are named.
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

  if (profile?.role !== "startup") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: startup } = await admin
    .from("startups")
    .select("id, subscription_tier")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!startup) return NextResponse.json({ savers: [], count: 0, locked: false });

  // The startup's own tier governs this, not the owner profile's -- the same
  // rule the deals page uses for identity reveal.
  const { isLaunch } = await getLaunchStatus();
  const ctx = buildAccessContext({ ...profile, subscription_tier: startup.subscription_tier } as any, isLaunch);
  const canSeeWho = founderCan(ctx).seeInvestorIdentity;

  const { data: rows, count } = await admin
    .from("watchlists")
    .select("created_at, investor:investors(slug, display_name, firm_name, type, min_check, max_check)", { count: "exact" })
    .eq("startup_id", startup.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Locked plans still get the number -- knowing three investors saved you is
  // the thing that makes the upgrade worth buying. They just don't get names.
  if (!canSeeWho) {
    return NextResponse.json({ savers: [], count: count ?? 0, locked: true });
  }

  const savers = (rows ?? [])
    .map((r: any) => ({
      slug:      r.investor?.slug ?? null,
      name:      r.investor?.display_name ?? r.investor?.firm_name ?? null,
      firm:      r.investor?.firm_name ?? null,
      type:      r.investor?.type ?? null,
      minCheck:  r.investor?.min_check ?? null,
      maxCheck:  r.investor?.max_check ?? null,
      savedAt:   r.created_at,
    }))
    .filter((s) => s.slug);   // an investor row that vanished is not a saver

  return NextResponse.json({ savers, count: count ?? 0, locked: false });
}
