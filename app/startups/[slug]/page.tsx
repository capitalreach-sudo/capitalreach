import { notFound } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { StartupDetailClient } from "@/components/startup/startup-detail-client";
import { getLaunchStatus } from "@/lib/launchMode";
import type { Metadata } from "next";

export const revalidate = 120; // ISR — revalidate every 2 minutes

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient();
  const { data: startup } = await supabase
    .from("startups")
    .select("name, tagline, industry, stage, funding_target")
    .eq("slug", params.slug)
    .single();

  if (!startup) return {};

  return {
    title: `${startup.name} — ${startup.tagline}`,
    description: `${startup.name} is raising for ${startup.stage}. Browse their pitch, traction, and team on CapitalReach.`,
    openGraph: {
      title: `${startup.name} | CapitalReach`,
      description: startup.tagline,
      type: "website",
    },
    other: {
      "script:ld+json": JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: startup.name,
        description: startup.tagline,
      }),
    },
  };
}

export async function generateStaticParams() {
  // Use admin client (no cookies) since this runs at build time outside request scope
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("startups")
    .select("slug")
    .eq("status", "active")
    .limit(200);
  return (data || []).map(s => ({ slug: s.slug }));
}

export default async function StartupDetailPage({ params }: Props) {
  const supabase = await createServerSupabaseClient();

  const { data: startup } = await supabase
    .from("startups")
    .select(`
      *,
      founders:startup_founders(*),
      documents:startup_documents(*),
      milestones:startup_milestones(*)
    `)
    .eq("slug", params.slug)
    .single();

  if (!startup || startup.status !== "active") notFound();

  // Track pageview (server-side increment)
  try { await supabase.rpc("increment_pageview", { startup_id: startup.id }); } catch { /* ok */ }

  // Get current user tier
  const { data: { user } } = await supabase.auth.getUser();
  const { isLaunch } = await getLaunchStatus();
  let investorTier: string | null = null;
  let investorId: string | null = null;
  let ndaSigned = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, subscription_tier")
      .eq("id", user.id)
      .single();

    if (profile?.role === "investor") {
      investorTier = profile.subscription_tier;
      const { data: inv } = await supabase
        .from("investors")
        .select("id")
        .eq("owner_id", user.id)
        .single();
      investorId = inv?.id || null;

      if (investorId && startup.require_nda) {
        const { data: nda } = await supabase
          .from("nda_records")
          .select("signed_at")
          .match({ startup_id: startup.id, investor_id: investorId })
          .single();
        ndaSigned = !!nda?.signed_at;
      }
    }
  }

  // Related startups
  const { data: related } = await supabase
    .from("startups")
    .select("id, slug, name, tagline, industry, stage, funding_target, mrr, pageviews, featured, created_at, subscription_tier")
    .eq("status", "active")
    .eq("industry", startup.industry)
    .neq("id", startup.id)
    .limit(4);

  // Live viewer count placeholder (handled client-side via Supabase Presence)
  return (
    <>
      <Navbar />
      <StartupDetailClient
        startup={startup as any}
        investorTier={investorTier as any}
        investorId={investorId}
        ndaSigned={ndaSigned}
        relatedStartups={(related as any) || []}
        isLaunchMode={isLaunch}
      />
      <Footer />
    </>
  );
}
