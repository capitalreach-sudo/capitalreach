import { createAdminClient } from "@/lib/supabase-server";
import { getPlatformStats }  from "@/lib/stats";
import { Navbar }            from "@/components/shared/navbar";
import { Footer }            from "@/components/shared/footer";
import { HomepageClient }    from "@/components/homepage/homepage-client";
import type { Metadata }     from "next";

// force-dynamic here dated to the initial commit: every visitor paid a full
// SSR pass (stats + listings queries) on the most-visited page. Nothing on it
// is caller-specific -- the admin client reads no cookies and translation
// happens client-side. revalidate alone doesn't flip it because the root
// layout's locale-cookie read marks every non-SSG route dynamic; force-static
// overrides that the same way generateStaticParams already does for
// /startups/[slug], whose pages prove the whole layout chain renders fine
// statically (the cookie read falls back to the default locale and the
// client hydrates the real one).
export const dynamic = "force-static";
export const revalidate = 120;

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
