import { notFound } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { StartupDetailClient } from "@/components/startup/startup-detail-client";
import { stripLockedUrl } from "@/lib/document-access";
import { investorCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";
import type { Startup, SubscriptionTier } from "@/types";
import type { Metadata } from "next";
import type { StartupCardData } from "@/components/startup/startup-card";

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
    .single()
    // Union narrowings below are licensed by the DB CHECK constraints.
    .returns<Startup>();

  if (!startup || startup.status !== "active") notFound();

  // Track pageview (server-side increment)
  try { await supabase.rpc("increment_pageview", { startup_id: startup.id }); } catch { /* ok */ }

  // Get current user tier
  const { data: { user } } = await supabase.auth.getUser();
  const { isLaunch } = await getLaunchStatus();
  let investorTier: SubscriptionTier | null = null;
  let investorId: string | null = null;
  let ndaSigned = false;
  let viewerSuspended = false;
  let viewerIsAdmin = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, subscription_tier, suspended, account_status")
      .eq("id", user.id)
      .single()
      // tier's narrowing from string to the union is licensed by the DB CHECK.
      .returns<Pick<import("@/types").Profile, "role" | "subscription_tier" | "suspended" | "account_status">>();

    viewerSuspended = !!profile?.suspended
      || profile?.account_status === "suspended"
      || profile?.account_status === "banned";
    viewerIsAdmin = profile?.role === "admin";

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

      // Terms §3 defines a "CapitalReach connection" as the investor finding
      // the startup here — this is the record that proves it for fee purposes.
      // One row per pair per day (unique index); conflicts are expected.
      if (investorId) {
        try {
          const admin = createAdminClient();
          await admin.from("startup_views").insert({
            startup_id: startup.id,
            investor_id: investorId,
          });
        } catch { /* duplicate view for today — nothing to record */ }
      }
    }
  }

  // Any existing deal between this viewer and this startup. Read with the
  // caller's own client, not the admin one -- RLS already scopes deals to the
  // two sides, so if this returns a row the viewer is entitled to see it.
  //
  // Only the viewer's own deal is ever fetched. A startup's other conversations
  // are nobody else's business, and nothing here is rendered to the public.
  type ViewerDeal = { id: string; status: string };
  let viewerDeal: ViewerDeal | null = null;
  if (investorId) {
    const { data: deal } = await supabase
      .from("deals")
      .select("id, status")
      .match({ startup_id: startup.id, investor_id: investorId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    viewerDeal = (deal as ViewerDeal | null) ?? null;
  }

  // Updates feed + Q&A (RLS: answered questions are public; the caller's own
  // unanswered ones come back too when they asked them).
  const [{ data: updates }, { data: questions }] = await Promise.all([
    supabase.from("startup_updates")
      .select("id, title, body, created_at")
      .eq("startup_id", startup.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("listing_questions")
      .select("id, question, answer, answered_at, created_at")
      .eq("startup_id", startup.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Related startups
  const { data: related } = await supabase
    .from("startups")
    .select("id, slug, name, tagline, industry, stage, funding_target, mrr, arr, growth_rate, runway_months, created_at, vaultrise_score, round_close_date")
    .eq("status", "active")
    .eq("industry", startup.industry)
    .neq("id", startup.id)
    .limit(4)
    // stage's narrowing from string to the union is licensed by the DB CHECK.
    .returns<StartupCardData[]>();

  // Live viewer count placeholder (handled client-side via Supabase Presence)
  // The URL is the access control. The client renders padlocks from the same
  // facts, but it must never HOLD a url it may not open -- devtools reads
  // what a padlock hides. Same rule as /api/deals/resources (lib/document-access).
  const viewerCaps = investorCan({
    userId: investorId,
    role: investorId ? ("investor" as const) : null,
    tier: investorTier,
    isLaunchMode: isLaunch,
    suspended: viewerSuspended,
  });
  const docCtx = {
    isOwnerOrAdmin: (!!user && user.id === startup.owner_id) || viewerIsAdmin,
    canDocuments: viewerCaps.viewDocuments,
    startupRequiresNda: !!startup.require_nda,
    ndaSigned,
  };
  const safeStartup = {
    ...startup,
    documents: (startup.documents ?? []).map((d) => stripLockedUrl(d, docCtx)),
  };

  return (
    <>
      <Navbar />
      <StartupDetailClient
        startup={safeStartup}
        investorTier={investorTier}
        investorId={investorId}
        viewerDeal={viewerDeal}
        ndaSigned={ndaSigned}
        relatedStartups={related ?? []}
        updates={updates ?? []}
        isOwner={!!user && user.id === startup.owner_id}
        questions={questions ?? []}
        isLaunchMode={isLaunch}
        viewerSuspended={viewerSuspended}
      />
      <Footer />
    </>
  );
}
