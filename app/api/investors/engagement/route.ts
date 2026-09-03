import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { getLaunchStatus } from "@/lib/launchMode";

/**
 * The investor-side mirror of the founder's viewers panel -- the first inbound
 * engagement surface investors have ever had. Founders could always see who
 * viewed and saved them; an investor's profile accumulated nothing (there was
 * no investor_views table until 107) and the interest count the API computed
 * was rendered nowhere.
 *
 * Counts for every plan; NAMES for paid investor tiers (and everyone during
 * launch) -- the same counts-sell-the-upgrade shape the founder side uses.
 * A viewer who is a private investor is counted, never named (house rule).
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: investor } = await admin
    .from("investors")
    .select("id, subscription_tier")
    .eq("owner_id", user.id)
    .eq("is_external", false)
    .maybeSingle();
  if (!investor) return NextResponse.json({ views: 0, series: [], viewers: [], interest: 0, conversations: 0, locked: false });

  const { isLaunch } = await getLaunchStatus();
  const canSeeWho = isLaunch || ["angel", "pro", "institution"].includes(investor.subscription_tier ?? "");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [viewsRes, interestRes, threadsRes] = await Promise.all([
    admin.from("investor_views")
      .select("viewer_id, viewed_at")
      .eq("investor_id", investor.id)
      .gte("viewed_at", thirtyDaysAgo.toISOString())
      .order("viewed_at", { ascending: false })
      .limit(500),
    admin.from("interest_signals")
      .select("id", { count: "exact", head: true })
      .eq("target_type", "investor").eq("target_id", investor.id),
    admin.from("threads")
      .select("id", { count: "exact", head: true })
      .or(`recipient_investor_id.eq.${investor.id},and(investor_id.eq.${investor.id},startup_id.is.null)`)
      .gte("created_at", thirtyDaysAgo.toISOString()),
  ]);

  const rows = viewsRes.data ?? [];

  // Per-day series for the sparkline (30 buckets, oldest first).
  const series = new Array(30).fill(0);
  const dayMs = 86_400_000;
  for (const r of rows) {
    const idx = 29 - Math.floor((Date.now() - new Date(r.viewed_at).getTime()) / dayMs);
    if (idx >= 0 && idx < 30) series[idx] += 1;
  }

  // Distinct viewers, newest first; resolve to a public identity where one
  // exists. Private investors and bare accounts are counted, never named.
  const distinctIds: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!seen.has(r.viewer_id)) { seen.add(r.viewer_id); distinctIds.push(r.viewer_id); }
  }

  let viewers: Array<{ name: string; kind: "investor" | "founder"; slug: string | null; lastAt: string }> = [];
  if (canSeeWho && distinctIds.length) {
    const ids = distinctIds.slice(0, 50);
    const [invs, sts] = await Promise.all([
      admin.from("investors")
        .select("owner_id, slug, display_name, firm_name, is_public, is_external")
        .in("owner_id", ids),
      admin.from("startups")
        .select("owner_id, slug, name, status")
        .in("owner_id", ids),
    ]);
    const invByOwner = new Map((invs.data ?? []).map(i => [i.owner_id as string, i]));
    const stByOwner = new Map((sts.data ?? []).map(s => [s.owner_id as string, s]));
    for (const id of ids) {
      const lastAt = rows.find(r => r.viewer_id === id)?.viewed_at ?? "";
      const inv = invByOwner.get(id);
      if (inv && inv.is_public && !inv.is_external) {
        viewers.push({ name: inv.display_name || inv.firm_name || "An investor", kind: "investor", slug: inv.slug, lastAt });
        continue;
      }
      const st = stByOwner.get(id);
      if (st && st.status === "active") {
        viewers.push({ name: st.name, kind: "founder", slug: st.slug, lastAt });
      }
      // Neither public entity: counted in `views`, not listed.
    }
    viewers = viewers.slice(0, 20);
  }

  return NextResponse.json({
    views: seen.size,
    series,
    viewers,
    interest: interestRes.count ?? 0,
    conversations: threadsRes.count ?? 0,
    locked: !canSeeWho,
  });
}
