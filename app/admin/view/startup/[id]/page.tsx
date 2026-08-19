import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import type { Profile, Startup } from "@/types";
import { StartupDashboardClient } from "@/components/dashboard/startup-dashboard-client";
import { Navbar } from "@/components/shared/navbar";
import { AdminNotes } from "@/components/admin/admin-notes";
import { getLaunchStatus } from "@/lib/launchMode";
import { isUuid } from "@/lib/utils";

/**
 * The founder dashboard, as its founder sees it, for an admin.
 *
 * An admin's dashboard path is /admin, so there has been no route by which
 * they could reach a founder dashboard at all -- which meant every feature
 * built there was invisible to the person reviewing the work, and no support
 * question about "my dashboard shows the wrong number" could ever be answered.
 *
 * Read-only by construction rather than by discipline:
 *   - The page is under /admin, which middleware already gates on role.
 *   - The role is re-checked here rather than trusted from the URL prefix;
 *     an auth guard that exists in exactly one place is one refactor away
 *     from not existing.
 *   - `viewingAs` puts the client into a mode with every mutating control
 *     removed, so an admin cannot start an AI job or open a billing portal
 *     against someone else's account by clicking around.
 *   - Every visit is written to admin_actions. Looking at another user's
 *     data is an administrative act and belongs in the same log as suspending
 *     them.
 *
 * It is deliberately NOT session impersonation: nothing here swaps the
 * admin's identity, so there is no state in which a write could be attributed
 * to the founder.
 */
export default async function AdminViewStartupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // A non-uuid would reach Postgres as a 22P02 and surface as a 500.
  if (!isUuid(id)) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: viewer } = await supabase
    .from("profiles").select("*").eq("id", user.id).single().returns<Profile>();
  if (viewer?.role !== "admin") notFound();

  // Service role: the founder dashboard's own queries are scoped to
  // owner_id = the signed-in user, which is exactly what must not apply here.
  const admin = createAdminClient();

  const { data: startup } = await admin
    .from("startups")
    .select(`
      *,
      founders:startup_founders(*),
      documents:startup_documents(*),
      milestones:startup_milestones(*)
    `)
    .eq("id", id)
    .single()
    .returns<Startup>();
  if (!startup) notFound();

  const { data: owner } = await admin
    .from("profiles").select("*").eq("id", startup.owner_id).single().returns<Profile>();

  // Same analytics the founder sees, so the two views cannot disagree.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const viewSeries: number[] = Array(30).fill(0);
  const raise = { softCircled: 0, committed: 0 };

  const [{ data: viewRows }, { count: saves }, { data: dealRows }] = await Promise.all([
    admin.from("pageviews").select("created_at").eq("startup_id", startup.id).gte("created_at", thirtyDaysAgo).limit(10000),
    admin.from("watchlists").select("*", { count: "exact", head: true }).eq("startup_id", startup.id),
    admin.from("deals").select("status, amount").eq("startup_id", startup.id).neq("status", "passed"),
  ]);

  const DAY = 24 * 60 * 60 * 1000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const r of viewRows ?? []) {
    const idx = 29 - Math.floor((today.getTime() - new Date(r.created_at).setHours(0, 0, 0, 0)) / DAY);
    if (idx >= 0 && idx < 30) viewSeries[idx] += 1;
  }
  for (const d of dealRows ?? []) {
    if (d.status === "closed") raise.committed += d.amount ?? 0;
    else if (d.status === "term_sheet") raise.softCircled += d.amount ?? 0;
  }

  // Awaited, never detached: Vercel freezes the lambda once the response is
  // returned, so a fire-and-forget insert here would simply never run and the
  // access log would be quietly incomplete.
  await admin.from("admin_actions").insert({
    admin_id: user.id,
    action: "view_as",
    target_type: "startup",
    target_id: startup.id,
    note: startup.name,
  });

  const { isLaunch } = await getLaunchStatus();

  return (
    <>
      <Navbar />
      <StartupDashboardClient
        profile={owner ?? viewer}
        startup={startup}
        analytics={{
          views: viewRows?.length ?? 0,
          saves: saves ?? 0,
          deals: dealRows?.length ?? 0,
          viewSeries,
          raise,
        }}
        isLaunchMode={isLaunch}
        viewingAs={owner?.full_name || owner?.email || startup.name}
      />
      {/* E53: the operator's notebook on this listing, below the dashboard
          they are impersonating. */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 48px" }}>
        <AdminNotes targetType="startup" targetId={startup.id} />
      </div>
    </>
  );
}
