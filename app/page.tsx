import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getPlatformStats }           from "@/lib/stats";
import { Navbar }                     from "@/components/shared/navbar";
import { Footer }                     from "@/components/shared/footer";
import { HomepageClient }             from "@/components/homepage/homepage-client";
import type { Metadata }              from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CapitalReach — Private Capital Marketplace",
  description:
    "The private marketplace for founders raising capital and investors deploying it. Vetted listings. AI-powered analysis. 2% fee only after close.",
};

export type HeroStartup = {
  id: string; name: string; slug: string; logo_url: string | null;
  industry: string; stage: string;
  mrr: number | null; arr: number | null; growth_mom: number | null; runway: number | null;
  funding_target: number; vaultrise_score: number | null;
};

export type ListingSnippet = {
  id: string; name: string; slug: string; logo_url: string | null;
  industry: string; stage: string;
  mrr: number | null; funding_target: number; vaultrise_score: number | null;
};

export default async function HomePage() {
  let heroStartup: HeroStartup | null = null;
  let listings: ListingSnippet[]      = [];

  try {
    const supabase = await createServerSupabaseClient();
    const stats    = await getPlatformStats(supabase);

    const [heroRes, listingsRes] = await Promise.all([
      supabase
        .from("startups")
        .select("id,name,slug,logo_url,industry,stage,mrr,arr,growth_mom,runway,funding_target,vaultrise_score")
        .eq("status", "active")
        .order("vaultrise_score", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("startups")
        .select("id,name,slug,logo_url,industry,stage,mrr,funding_target,vaultrise_score")
        .eq("status", "active")
        .order("vaultrise_score", { ascending: false })
        .limit(8),
    ]);

    heroStartup = heroRes.data ?? null;
    listings    = listingsRes.data ?? [];

    return (
      <>
        <Navbar />
        <HomepageClient stats={stats} heroStartup={heroStartup} listings={listings} />
        <Footer />
      </>
    );
  } catch {
    // DB not configured — still render the page shell
  }

  const { getPlatformStats: gps } = await import("@/lib/stats");
  const fallbackStats = await gps();

  return (
    <>
      <Navbar />
      <HomepageClient stats={fallbackStats} heroStartup={null} listings={[]} />
      <Footer />
    </>
  );
}
