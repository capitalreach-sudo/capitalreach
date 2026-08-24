import { notFound } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { ReportButton } from "@/components/shared/report-button";
import { JsonLdScript } from "@/components/shared/json-ld";
import { startupJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { StartupDetailClient } from "@/components/startup/startup-detail-client";
import { stripLockedUrl } from "@/lib/document-access";
import { investorCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";
import { protectFounders } from "@/lib/identity";
import type { Startup, SubscriptionTier } from "@/types";
import type { Metadata } from "next";
import type { StartupCardData } from "@/components/startup/startup-card";

export const revalidate = 120; // ISR — revalidate every 2 minutes

interface Props {
  params: { slug: string };
  searchParams?: { preview?: string; share?: string };
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
      url: `/startups/${params.slug}`,
    },
    // The structured data used to live here, in `other`, which Next renders
    // as <meta name="script:ld+json"> — a meta tag no crawler reads. It is a
    // real <script type="application/ld+json"> in the page body now.
    alternates: { canonical: `/startups/${params.slug}` },
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

export default async function StartupDetailPage({ params, searchParams }: Props) {
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

    if (profile?.role === "investor" || profile?.role === "admin") {
      // Admins may own an investor profile of their own (the operator who
      // also writes cheques); the buttons follow the entity, not the role.
      investorTier = profile.subscription_tier;
      const { data: inv } = await supabase
        .from("investors")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();
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

  // B19: public momentum, only when the founder opted in. Aggregates only —
  // never who. Interested = open deals; committed = soft-circle/verbal/
  // committed sums + closed amounts.
  let momentum: { interested: number; committedCount: number; committedAmount: number; softAmount: number; currency: string } | null = null;
  if (startup.show_momentum) {
    const { data: ds } = await createAdminClient()
      .from("deals").select("status, amount, currency, commitment_type")
      .eq("startup_id", startup.id).neq("status", "passed");
    const rows = ds ?? [];
    // Same buckets as the founder's own raise tracker: a soft circle is NOT
    // a commitment, and a public bar that calls it one is the kind of number
    // this platform exists not to publish. Soft/verbal are reported
    // separately; the bar fills on committed only.
    const committedRows = rows.filter((d) => d.status === "closed" || d.commitment_type === "committed");
    const softRows = rows.filter((d) => d.status !== "closed" && (d.commitment_type === "soft_circle" || d.commitment_type === "verbal"));
    momentum = {
      interested: rows.length,
      committedCount: committedRows.length,
      committedAmount: committedRows.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
      softAmount: softRows.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
      currency: (rows.find((d) => d.currency)?.currency as string) || "USD",
    };
  }

  // C33: who else is looking — only investors who explicitly opted in, and
  // only shown to other investors. Never to the public, never amounts.
  let coInvestors: Array<{ slug: string; name: string | null; type: string | null }> = [];
  if (investorId) {
    const { data: pub } = await createAdminClient()
      .from("deals")
      .select("investor:investors(slug, display_name, firm_name, type)")
      .eq("startup_id", startup.id)
      .eq("public_interest", true)
      .neq("status", "passed")
      .neq("investor_id", investorId)
      .limit(24);
    coInvestors = (pub ?? []).map((d) => {
      const i = d.investor as unknown as { slug: string; display_name: string | null; firm_name: string | null; type: string | null } | null;
      return i ? { slug: i.slug, name: i.display_name || i.firm_name || null, type: i.type } : null;
    }).filter((x): x is { slug: string; name: string | null; type: string | null } => !!x);
  }

  // Non-circumvention acknowledgment for this pair (Phase 1). Read with the
  // caller's client — RLS scopes acks to the investor who made them.
  let circumventionAcked = false;
  if (user && investorId) {
    const { data: ack } = await supabase
      .from("circumvention_acks")
      .select("id")
      .match({ investor_id: user.id, startup_id: startup.id })
      .maybeSingle();
    circumventionAcked = !!ack;
  }

  // Updates feed + Q&A (RLS: answered questions are public; the caller's own
  // unanswered ones come back too when they asked them).
  const [{ data: updates }, { data: questions }] = await Promise.all([
    supabase.from("startup_updates")
      .select("id, title, body, created_at")
      .eq("startup_id", startup.id)
      .order("created_at", { ascending: false })
      .limit(10),
    // B20: the founder (RLS lets them read every question on their startup)
    // also gets the asker's identity; everyone else sees no asker.
    supabase.from("listing_questions")
      .select("id, question, answer, answered_at, created_at, is_private, investor:investors(slug, display_name, firm_name)")
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
  const isOwner = !!user && user.id === startup.owner_id;

  // Owner preview: ?preview=investor renders this page as a signed-out-tier
  // ("free") investor would see it -- gates closed, documents locked, upgrade
  // prompts visible. "View listing" always showed the founder the unlocked
  // version, so what a real investor actually meets was unknowable without a
  // second account. Owner or admin only: for anyone else the param is
  // ignored rather than erroring, so a shared link with the param on it
  // degrades to the normal page.
  const previewing = (isOwner || viewerIsAdmin) && searchParams?.preview === "investor";

  // The URL is the access control. The client renders padlocks from the same
  // facts, but it must never HOLD a url it may not open -- devtools reads
  // what a padlock hides. Same rule as /api/deals/resources (lib/document-access).
  // Under preview the context is computed exactly as for a free investor --
  // including URL stripping, so the preview is honest rather than cosmetic.
  const viewerCaps = investorCan({
    userId: previewing ? null : investorId,
    role: previewing ? ("investor" as const) : viewerIsAdmin ? ("admin" as const) : investorId ? ("investor" as const) : null,
    tier: previewing ? null : investorTier,
    isLaunchMode: isLaunch,
    suspended: previewing ? false : viewerSuspended,
  });
  // 089: a share link the founder minted can carry deck access for someone
  // with no account. The TOKEN is re-checked here against this startup rather
  // than trusting a query parameter — ?share=anything would otherwise be a
  // universal key. NDA-gated documents still require the NDA; a share link
  // grants the room, not a signature.
  // A founder viewing someone ELSE's listing can message that founder.
  let viewerStartupId: string | null = null;
  if (user && !isOwner && !investorId && !viewerIsAdmin) {
    const { data: own } = await createAdminClient()
      .from("startups").select("id").eq("owner_id", user.id).limit(1).maybeSingle();
    viewerStartupId = own?.id ?? null;
  }

  const shareToken = typeof searchParams?.share === "string" ? searchParams.share.slice(0, 64) : null;
  let shareGrantsDocs = false;
  if (shareToken && !previewing) {
    const { data: share } = await createAdminClient()
      .from("round_shares")
      .select("startup_id, grants_documents, expires_at, revoked_at")
      .eq("token", shareToken)
      .maybeSingle();
    shareGrantsDocs = !!share
      && share.startup_id === startup.id
      && share.grants_documents
      && !share.revoked_at
      && (!share.expires_at || new Date(share.expires_at) > new Date());
  }

  const docCtx = {
    isOwnerOrAdmin: previewing ? false : isOwner || viewerIsAdmin,
    // Any signed-in investor is in the room (preview simulates one); NDA-gated
    // docs still need the NDA below.
    isInvestor: previewing ? true : !!investorId || shareGrantsDocs,
    startupRequiresNda: !!startup.require_nda,
    ndaSigned: previewing ? false : ndaSigned,
  };
  // Identity protection (Phase 1): founders' full names and social links are
  // revealed only to the owner, admins, or an investor with a live deal on
  // this startup — the deal that required the non-circumvention ack. Masked
  // on the server so the hidden fields never reach the browser.
  const identityRevealed = !previewing && (
    isOwner || viewerIsAdmin || (!!viewerDeal && viewerDeal.status !== "passed")
  );
  const safeStartup = {
    ...startup,
    founders: protectFounders(startup.founders, identityRevealed),
    documents: (startup.documents ?? []).map((d) => stripLockedUrl(d, docCtx, previewing ? null : shareToken)),
  };

  // Metric history rides the same gate as the single MRR number: financial
  // tier (or the owner outside preview). Fetched only when it will render, so
  // a gated viewer's payload does not carry the curve either.
  let metricHistory: Array<{ month: string; mrr: number | null; arr: number | null; user_count: number | null; paying_customers: number | null }> = [];
  if (viewerCaps.viewFinancials || (isOwner && !previewing) || (viewerIsAdmin && !previewing)) {
    const { data: mh } = await createAdminClient()
      .from("startup_metrics")
      .select("month, mrr, arr, user_count, paying_customers")
      .eq("startup_id", startup.id)
      .order("month", { ascending: true })
      .limit(24);
    metricHistory = mh ?? [];
  }

  return (
    <>
      <Navbar />
      <JsonLdScript data={startupJsonLd({
        name: safeStartup.name,
        slug: safeStartup.slug,
        tagline: safeStartup.tagline,
        website: safeStartup.website ?? null,
        country: safeStartup.country ?? null,
        founded_year: safeStartup.founded_year ?? null,
        industry: safeStartup.industry ?? null,
      })} />
      <JsonLdScript data={breadcrumbJsonLd([
        { name: "Startups", path: "/startups" },
        { name: safeStartup.name, path: `/startups/${safeStartup.slug}` },
      ])} />
      <StartupDetailClient
        startup={safeStartup}
        investorTier={previewing ? null : investorTier}
        investorId={previewing ? null : investorId}
        viewerDeal={previewing ? null : viewerDeal}
        ndaSigned={previewing ? false : ndaSigned}
        relatedStartups={related ?? []}
        updates={updates ?? []}
        isOwner={previewing ? false : isOwner}
        viewerStartupId={previewing ? null : viewerStartupId}
        viewerIsAdmin={previewing ? false : viewerIsAdmin}
        questions={(questions ?? []).map((q) => {
          const inv = (q as unknown as { investor?: { slug: string; display_name: string | null; firm_name: string | null } | null }).investor;
          return {
            id: q.id, question: q.question, answer: q.answer, answered_at: q.answered_at, created_at: q.created_at,
            is_private: (q as unknown as { is_private?: boolean }).is_private ?? false,
            asker: isOwner || viewerIsAdmin ? (inv ? { slug: inv.slug, name: inv.display_name || inv.firm_name || null } : null) : null,
          };
        })}
        isLaunchMode={isLaunch}
        viewerSuspended={previewing ? false : viewerSuspended}
        previewing={previewing}
        metricHistory={metricHistory}
        identityRevealed={identityRevealed}
        circumventionAcked={previewing ? false : circumventionAcked}
        momentum={momentum}
        coInvestors={coInvestors}
      />
      {/* E50: reporting a listing needs someone to come back to, so it is
          offered to signed-in visitors who are not the owner. */}
      {user && !isOwner && !previewing && (
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 32px", textAlign: "center" }}>
          <ReportButton targetType="startup" targetId={safeStartup.id} />
        </div>
      )}
      <Footer />
    </>
  );
}
