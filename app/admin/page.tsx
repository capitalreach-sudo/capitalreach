import { createServerSupabaseClient } from "@/lib/supabase-server";
import { AdminClient } from "@/components/admin/admin-client";
import { Navbar } from "@/components/shared/navbar";

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();

  // Middleware already guards this — fetch all data
  const [
    { data: pendingStartups },
    { data: allStartups },
    { data: allInvestors },
    { data: allDeals },
    { count: startupCount },
    { count: investorCount },
  ] = await Promise.all([
    supabase.from("startups").select("*, owner:profiles(email, full_name)").eq("status", "pending_review").order("created_at", { ascending: false }),
    supabase.from("startups").select("*, owner:profiles(email, full_name)").order("created_at", { ascending: false }).limit(50),
    supabase.from("investors").select("*, owner:profiles(email, full_name, subscription_tier)").order("created_at", { ascending: false }).limit(50),
    supabase.from("deals").select("*, startup:startups(name), investor:investors(slug)").order("updated_at", { ascending: false }).limit(50),
    supabase.from("startups").select("*", { count: "exact", head: true }),
    supabase.from("investors").select("*", { count: "exact", head: true }),
  ]);

  // Revenue approximation (in real app, query Stripe)
  const tierPrices: Record<string, number> = {
    starter: 19,
    growth: 49,
    angel: 99,
    pro_investor: 299,
  };
  const startupMrr = (allStartups || []).reduce((sum, s) => sum + (tierPrices[s.subscription_tier] || 0), 0);
  const investorMrr = (allInvestors || []).reduce((sum, i) => sum + (tierPrices[i.subscription_tier] || 0), 0);

  return (
    <>
      <Navbar />
      <AdminClient
        pendingStartups={(pendingStartups as any) || []}
        allStartups={(allStartups as any) || []}
        allInvestors={(allInvestors as any) || []}
        allDeals={(allDeals as any) || []}
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
