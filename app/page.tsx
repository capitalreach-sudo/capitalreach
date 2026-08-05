import { createAdminClient } from "@/lib/supabase-server";
import { getLaunchStatus } from "@/lib/launchMode";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import type { StartupCardData } from "@/components/startup/startup-card";
import { HomeCopy } from "@/components/homepage/home-copy";
import type { Metadata } from "next";

// Static with 2-minute revalidation: nothing here is caller-specific, and the
// root layout's locale-cookie read would otherwise mark the route dynamic.
// Same proven arrangement as /startups/[slug].
export const dynamic = "force-static";
export const revalidate = 120;

export const metadata: Metadata = {
  title: "CapitalReach — Private Capital Marketplace",
  description:
    "The private marketplace for founders raising capital and investors deploying it. Vetted listings. 2% fee only after close.",
};

/**
 * Four sections. One hook, one action:
 *   1. Navbar (shared component)
 *   2. Hero — headline, one sentence, two CTAs, trust row, one real listing
 *   3. Proof strip — three product facts (never DB counts: those are only
 *      credible once they're large, and a static fact can't read "0")
 *   4. Footer (shared component)
 *
 * Everything the old ten-section page also said lives where it belongs:
 * how-it-works on /about, AI on /ai, pricing on /pricing, data on /data.
 */
export default async function HomePage() {
  let hero: StartupCardData | null = null;
  let launch = { isLaunch: false, memberCount: 0, target: 100 };

  try {
    const supabase = createAdminClient();
    const [heroRes, launchRes] = await Promise.all([
      supabase
        .from("startups")
        .select("id, slug, name, tagline, industry, stage, funding_target, mrr, arr, growth_rate, runway_months, created_at, vaultrise_score")
        .eq("status", "active")
        .order("vaultrise_score", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
        // stage's narrowing from string to the union is licensed by the DB CHECK.
        .returns<StartupCardData>(),
      getLaunchStatus(),
    ]);
    hero = heroRes.data ?? null;
    launch = launchRes;
  } catch {
    /* DB unreachable — the page still renders every static section */
  }

  return (
    <>
      <Navbar />
      <HomeCopy launch={launch} hero={hero} />
      <Footer />
    </>
  );
}
