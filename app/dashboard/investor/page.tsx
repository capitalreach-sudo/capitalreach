import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { InvestorDashboardClient } from "@/components/dashboard/investor-dashboard-client";
import type { Profile, Investor, Watchlist, Deal, AiReport } from "@/types";
import { Navbar } from "@/components/shared/navbar";
import { postMoney } from "@/lib/round-math";

export default async function InvestorDashboardPage() {
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

  if (profile?.role !== "investor") redirect("/dashboard/startup");

  const { data: investor } = await supabase
    .from("investors")
    .select("*")
    .eq("owner_id", user.id)
    .single()
    .returns<Investor>();

  if (!investor) redirect("/onboarding/investor");

  // Watchlist
  const { data: watchlist } = await supabase
    .from("watchlists")
    .select("*, startup:startups(*)")
    .eq("investor_id", investor.id)
    // C26: was capped at 20 — a real shortlist outgrows that in a week.
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300)
    .returns<Watchlist[]>();

  // Deals
  const { data: deals } = await supabase
    .from("deals")
    .select("*, startup:startups(name, slug, tagline, industry, stage)")
    .eq("investor_id", investor.id)
    .order("updated_at", { ascending: false })
    .returns<Deal[]>();

  // AI reports
  const { data: aiReports } = await supabase
    .from("ai_reports")
    .select("*, startup:startups(name, slug)")
    .eq("investor_id", investor.id)
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<AiReport[]>();

  // D40 + D42: the portfolio is more than a list of receipts. For every
  // company this investor actually funded, pull the metric curve and the
  // latest founder update, so the position has something behind it.
  // Scoped strictly to their own closed deals.
  const portfolio: Array<{
    dealId: string; startupId: string; name: string; slug: string; status: string;
    amount: number | null; currency: string; closedAt: string | null;
    ownershipPercent: number | null; valuationAtClose: number | null; currentValuation: number | null;
    mrr: number | null; mrrSeries: number[]; latestUpdate: { title: string; created_at: string } | null;
  }> = [];
  {
    const closed = (deals ?? []).filter((d) => d.status === "closed");
    if (closed.length) {
      const admin = createAdminClient();
      const ids = closed.map((d) => d.startup_id);
      const [{ data: sts }, { data: metrics }, { data: updates }] = await Promise.all([
        admin.from("startups").select("id, name, slug, status, mrr, valuation, valuation_type, funding_target").in("id", ids),
        admin.from("startup_metrics").select("startup_id, month, mrr").in("startup_id", ids).order("month", { ascending: true }).limit(400),
        admin.from("startup_updates").select("startup_id, title, created_at").in("startup_id", ids).order("created_at", { ascending: false }).limit(100),
      ]);
      type PortfolioStartup = { id: string; name: string; slug: string; status: string; mrr: number | null; valuation: number | null; valuation_type: string | null; funding_target: number | null };
      const byId = new Map<string, PortfolioStartup>(((sts ?? []) as PortfolioStartup[]).map((x) => [x.id, x]));
      for (const d of closed) {
        const st = byId.get(d.startup_id);
        if (!st) continue;
        const dd = d as unknown as { ownership_percent?: number | null; valuation_at_close?: number | null; funded_at?: string | null; closed_at?: string | null };
        portfolio.push({
          dealId: d.id, startupId: st.id, name: st.name, slug: st.slug, status: st.status,
          amount: d.amount ?? null, currency: d.currency ?? "USD",
          closedAt: dd.funded_at ?? dd.closed_at ?? d.updated_at ?? null,
          ownershipPercent: dd.ownership_percent ?? null,
          valuationAtClose: dd.valuation_at_close ?? null,
          currentValuation: postMoney({ raise: st.funding_target, valuation: st.valuation, valuationType: st.valuation_type as "pre" | "post" | null }),
          mrr: st.mrr ?? null,
          mrrSeries: (metrics ?? []).filter((m) => m.startup_id === st.id).map((m) => Number(m.mrr) || 0).slice(-12),
          latestUpdate: (updates ?? []).find((u) => u.startup_id === st.id) ?? null,
        });
      }
    }
  }

  // D43: allocation for the period. Committed = live deals carrying a
  // commitment; deployed = money that has actually moved (funded), falling
  // back to closed when the funding step was never recorded.
  const allocation = (() => {
    let committed = 0, deployed = 0;
    for (const d of deals ?? []) {
      const amt = Number((d as unknown as { amount?: number | null }).amount ?? 0) || 0;
      const dd = d as unknown as { status: string; commitment_type?: string | null; funded_at?: string | null };
      if (dd.status === "closed") deployed += amt;
      else if (dd.commitment_type === "committed" || dd.commitment_type === "soft_circle" || dd.commitment_type === "verbal") committed += amt;
    }
    return { committed, deployed };
  })();

  return (
    <>
      <Navbar />
      <InvestorDashboardClient
        allocation={allocation}
        portfolio={portfolio}
        profile={profile}
        investor={investor}
        watchlist={watchlist ?? []}
        deals={deals ?? []}
        aiReports={aiReports ?? []}
      />
    </>
  );
}
