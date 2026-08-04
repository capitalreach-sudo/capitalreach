import { createServerSupabaseClient } from "@/lib/supabase-server";
import { AdminClient } from "@/components/admin/admin-client";
import type { Profile, Startup, Investor, Deal } from "@/types";
import { Navbar } from "@/components/shared/navbar";

// The exact embed shapes AdminClient's props declare; asserting them here is
// licensed by the DB CHECK constraints (unions) and NOT NULL owner FKs (embeds).
type AdminStartup  = Startup  & { owner: { email: string; full_name: string } };
type AdminInvestor = Investor & { owner: { email: string; full_name: string; subscription_tier: string } };
type AdminDeal     = Deal     & { startup: { name: string }; investor: { slug: string } };

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
    supabase.from("startups").select("*, owner:profiles(email, full_name)").eq("status", "pending_review").order("created_at", { ascending: false }).returns<AdminStartup[]>(),
    supabase.from("startups").select("*, owner:profiles(email, full_name)").order("created_at", { ascending: false }).limit(50).returns<AdminStartup[]>(),
    supabase.from("investors").select("*, owner:profiles(email, full_name, subscription_tier)").order("created_at", { ascending: false }).limit(50).returns<AdminInvestor[]>(),
    supabase.from("deals").select("*, startup:startups(name), investor:investors(slug)").order("updated_at", { ascending: false }).limit(50).returns<AdminDeal[]>(),
    supabase.from("startups").select("*", { count: "exact", head: true }),
    supabase.from("investors").select("*", { count: "exact", head: true }),
  ]);

  // Revenue approximation (in real app, query Stripe)
  const tierPrices: Record<string, number> = {
    starter: 29,
    growth: 79,
    angel: 99,
    pro_investor: 249,
    pro: 249,
    institution: 0,
    institutional: 0,
  };
  const startupMrr = (allStartups || []).reduce((sum, s) => sum + (tierPrices[s.subscription_tier] || 0), 0);
  const investorMrr = (allInvestors || []).reduce((sum, i) => sum + (tierPrices[i.subscription_tier] || 0), 0);

  return (
    <>
      <Navbar />
      <AdminClient
        pendingStartups={pendingStartups ?? []}
        allStartups={allStartups ?? []}
        allInvestors={allInvestors ?? []}
        allDeals={allDeals ?? []}
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
