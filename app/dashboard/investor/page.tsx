import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { InvestorDashboardClient } from "@/components/dashboard/investor-dashboard-client";
import { Navbar } from "@/components/shared/navbar";

export default async function InvestorDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "investor") redirect("/dashboard/startup");

  const { data: investor } = await supabase
    .from("investors")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (!investor) redirect("/onboarding/investor");

  // Watchlist
  const { data: watchlist } = await supabase
    .from("watchlists")
    .select("*, startup:startups(*)")
    .eq("investor_id", investor.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Deals
  const { data: deals } = await supabase
    .from("deals")
    .select("*, startup:startups(name, slug, tagline, industry, stage)")
    .eq("investor_id", investor.id)
    .order("updated_at", { ascending: false });

  // AI reports
  const { data: aiReports } = await supabase
    .from("ai_reports")
    .select("*, startup:startups(name, slug)")
    .eq("investor_id", investor.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <>
      <Navbar />
      <InvestorDashboardClient
        profile={profile as any}
        investor={investor as any}
        watchlist={(watchlist as any) || []}
        deals={(deals as any) || []}
        aiReports={(aiReports as any) || []}
      />
    </>
  );
}
