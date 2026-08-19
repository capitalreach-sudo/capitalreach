import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { InvestorDashboardClient } from "@/components/dashboard/investor-dashboard-client";
import type { Profile, Investor, Watchlist, Deal, AiReport } from "@/types";
import { Navbar } from "@/components/shared/navbar";
import { AdminNotes } from "@/components/admin/admin-notes";
import { isUuid } from "@/lib/utils";

/**
 * The investor dashboard, as its investor sees it, for an admin.
 *
 * Parity with /admin/view/startup/[id]: an admin's dashboard path is /admin,
 * so neither of the two member dashboards was reachable. Half a view-as
 * feature would still leave every investor-side question unanswerable.
 *
 * Same guarantees as the founder route -- role re-checked here rather than
 * trusted from the /admin prefix, service-role reads because the dashboard's
 * own queries are scoped to the signed-in user, read-only via `viewingAs`,
 * and the visit written to admin_actions. Not session impersonation: the
 * admin's identity is never swapped.
 */
export default async function AdminViewInvestorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: viewer } = await supabase
    .from("profiles").select("*").eq("id", user.id).single().returns<Profile>();
  if (viewer?.role !== "admin") notFound();

  const admin = createAdminClient();

  const { data: investor } = await admin
    .from("investors").select("*").eq("id", id).single().returns<Investor>();
  if (!investor) notFound();

  const [{ data: owner }, { data: watchlist }, { data: deals }, { data: aiReports }] = await Promise.all([
    // B18: an off-platform contact has no account, so there is no profile
    // to load — the page renders the investor row on its own.
    investor.owner_id
      ? admin.from("profiles").select("*").eq("id", investor.owner_id).single().returns<Profile>()
      : Promise.resolve({ data: null as Profile | null }),
    admin.from("watchlists").select("*, startup:startups(*)").eq("investor_id", investor.id)
      .order("created_at", { ascending: false }).limit(20).returns<Watchlist[]>(),
    admin.from("deals").select("*, startup:startups(name, slug, tagline, industry, stage)")
      .eq("investor_id", investor.id).order("updated_at", { ascending: false }).returns<Deal[]>(),
    admin.from("ai_reports").select("*, startup:startups(name, slug)").eq("investor_id", investor.id)
      .order("created_at", { ascending: false }).limit(10).returns<AiReport[]>(),
  ]);

  // Awaited: a detached insert never runs once the lambda is frozen.
  await admin.from("admin_actions").insert({
    admin_id: user.id,
    action: "view_as",
    target_type: "investor",
    target_id: investor.id,
    note: owner?.full_name || owner?.email || investor.slug,
  });

  return (
    <>
      <Navbar />
      <InvestorDashboardClient
        profile={owner ?? viewer}
        investor={investor}
        watchlist={watchlist ?? []}
        deals={deals ?? []}
        aiReports={aiReports ?? []}
        viewingAs={owner?.full_name || owner?.email || investor.slug}
      />
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 48px" }}>
        <AdminNotes targetType="investor" targetId={investor.id} />
      </div>
    </>
  );
}
