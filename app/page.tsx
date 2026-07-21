import { createAdminClient } from "@/lib/supabase-server";
import { getPlatformStats }  from "@/lib/stats";
import { Navbar }            from "@/components/shared/navbar";
import { Footer }            from "@/components/shared/footer";
import { HomepageClient }    from "@/components/homepage/homepage-client";
import type { Metadata }     from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CapitalReach — Private Capital Marketplace",
  description:
    "The private marketplace for founders raising capital and investors deploying it. Vetted listings. AI-powered analysis. 2% fee only after close.",
};

export type ListingSnippet = {
  id: string; name: string; slug: string;
  industry: string; stage: string;
  mrr: number | null; funding_target: number; vaultrise_score: number | null;
};

export default async function HomePage() {
  let listings: ListingSnippet[] = [];

  try {
    const supabase = createAdminClient();
    const stats    = await getPlatformStats(supabase);

    const listingsRes = await supabase
      .from("startups")
      .select("id,name,slug,industry,stage,mrr,funding_target,vaultrise_score")
      .eq("status", "active")
      .order("vaultrise_score", { ascending: false })
      .limit(8);

    listings = listingsRes.data ?? [];

    return (
      <>
        <Navbar />
        <HomepageClient stats={stats} listings={listings} />
        <Footer />
      </>
    );
  } catch {
    /* DB not configured — render shell */
  }

  return (
    <>
      <Navbar />
      <HomepageClient stats={{ startupCount: 0, investorCount: 0, totalRaised: 0, dealsClosedCount: 0 }} listings={[]} />
      <Footer />
    </>
  );
}
