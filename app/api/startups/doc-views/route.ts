import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { buildAccessContext, founderCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";

/**
 * Who opened this founder's documents (migration 039). Same shape and same
 * seeInvestorIdentity gate as savers/viewers: counts for everyone, names for
 * the plan that includes identity.
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
    .from("startups").select("id, subscription_tier").eq("owner_id", user.id).maybeSingle();
  if (!startup) return NextResponse.json({ docs: [], locked: false });

  const { isLaunch } = await getLaunchStatus();
  const ctx = buildAccessContext({ ...profile, subscription_tier: startup.subscription_tier }, isLaunch);
  const canSeeWho = founderCan(ctx).seeInvestorIdentity;

  const { data: rows } = await admin
    .from("document_views")
    .select("viewed_at, document:startup_documents!inner(id, label, startup_id), investor:investors(slug, display_name, firm_name, is_public, is_external)")
    .eq("document.startup_id", startup.id)
    .order("viewed_at", { ascending: false })
    .limit(500);

  const byDoc = new Map<string, { label: string; opens: number; viewers: Map<string, { slug: string; name: string | null; lastAt: string }> }>();
  for (const r of (rows ?? []) as any[]) {
    const d = r.document; if (!d) continue;
    if (!byDoc.has(d.id)) byDoc.set(d.id, { label: d.label, opens: 0, viewers: new Map() });
    const agg = byDoc.get(d.id)!;
    agg.opens += 1;
    const namable = r.investor?.is_public && !r.investor?.is_external;
    const slug = namable ? r.investor?.slug : null;
    if (slug && !agg.viewers.has(slug)) {
      agg.viewers.set(slug, { slug, name: r.investor?.display_name ?? r.investor?.firm_name ?? null, lastAt: r.viewed_at });
    }
  }

  const docs = Array.from(byDoc.entries()).map(([id, d]) => ({
    id,
    label: d.label,
    opens: d.opens,
    distinctViewers: d.viewers.size,
    viewers: canSeeWho ? Array.from(d.viewers.values()).slice(0, 20) : [],
  }));

  return NextResponse.json({ docs, locked: !canSeeWho });
}
