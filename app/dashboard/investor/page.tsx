import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { InvestorDashboardClient } from "@/components/dashboard/investor-dashboard-client";
import type { Profile, Investor, Watchlist, Deal, AiReport } from "@/types";
import { Navbar } from "@/components/shared/navbar";

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

  return (
    <>
      <Navbar />
      <InvestorDashboardClient
        profile={profile}
        investor={investor}
        watchlist={watchlist ?? []}
        deals={deals ?? []}
        aiReports={aiReports ?? []}
      />
    </>
  );
}
