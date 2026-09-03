import { unstable_cache } from "next/cache";
import { JsonLdScript } from "@/components/shared/json-ld";
import { organizationJsonLd, webSiteJsonLd } from "@/lib/seo";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase-server";
import { getPlatformStats }  from "@/lib/stats";
import { getLaunchStatus }   from "@/lib/launchMode";
import { Navbar }            from "@/components/shared/navbar";
import { Footer }            from "@/components/shared/footer";
import { HomepageClient }    from "@/components/homepage/homepage-client";
import type { Metadata }     from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Canonical: the app answers on more than one hostname (vercel.app plus
  // whatever domain it ends up on), and duplicate URLs split their own ranking.
  alternates: { canonical: "/" },
  title: "CapitalReach — Private Capital Marketplace",
  description:
    "The private marketplace for founders raising capital and investors deploying it. Vetted listings. AI-powered analysis. 2% success fee, paid by the startup only after it closes a round — investors pay nothing.",
};

export type ListingSnippet = {
  id: string; name: string; slug: string;
  industry: string; stage: string;
  funding_target: number | null; vaultrise_score: number | null;
  logo_url?: string | null;
};

const EMPTY_STATS = { startupCount: 0, investorCount: 0, totalRaised: 0, dealsClosedCount: 0 };
const NO_LAUNCH   = { isLaunch: false, memberCount: 0, target: 100 };

/**
 * Homepage. Four sections only: navbar, hero, proof strip (+ top listings
 * when any exist), footer. Everything the server needs is fetched in one
 * Promise.all — never serial awaits — and a database outage renders the
 * shell rather than an error page.
 */
export default async function HomePage() {
  let listings: ListingSnippet[] = [];
  let stats = EMPTY_STATS;
  let launch = NO_LAUNCH;

  try {
    const supabase = createAdminClient();
    // The stats and top-listings queries are identical for every visitor;
    // 60s of staleness is invisible on a marketing page, and the cache is
    // what keeps a cold lambda's TTFB from stacking four table scans.
    const cachedStats = unstable_cache(
      () => getPlatformStats(createAdminClient()),
      ["home-stats"], { revalidate: 60 },
    );
    const [statsRes, launchRes, listingsRes] = await Promise.all([
      cachedStats(),
      getLaunchStatus(),
      supabase
        .from("startups")
        .select("id,name,slug,industry,stage,funding_target,vaultrise_score")
        .eq("status", "active")
        .order("vaultrise_score", { ascending: false, nullsFirst: false })
        .limit(8),
    ]);
    stats    = statsRes;
    launch   = launchRes;
    listings = (listingsRes.data ?? []) as ListingSnippet[];
  } catch {
    /* DB not configured — render the shell with zero counts */
  }
  // The hero should never sell "List your startup" to someone who already
  // did. Runs as ONE awaited chain in parallel-friendly position: for the
  // anonymous majority getUser resolves locally from absent cookies without
  // a network hop, so this costs signed-in visitors only.
  let viewerRole: string | null = null;
  try {
    const sb = await createServerSupabaseClient();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      const { data: prof } = await createAdminClient().from("profiles").select("role").eq("id", user.id).maybeSingle();
      viewerRole = prof?.role ?? null;
    }
  } catch { /* anonymous render is the safe default */ }


  return (
    <>
      <Navbar />
      <JsonLdScript data={organizationJsonLd()} />
      <JsonLdScript data={webSiteJsonLd()} />
      <HomepageClient stats={stats} listings={listings} launch={launch} viewerRole={viewerRole} />
      <Footer />
    </>
  );
}
