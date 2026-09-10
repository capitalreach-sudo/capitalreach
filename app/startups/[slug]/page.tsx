import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { stripCardFinancials } from "@/lib/browse-data";
import { listingDetailPublic } from "@/lib/listing-visibility";
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
import { ListingLocked } from "@/components/startup/listing-locked";
import { getLocale } from "@/lib/locale-server";
import { detectLanguage } from "@/lib/detect-language";
import { TRANSLATABLE, collectFields, readCachedTranslation, translationAvailable } from "@/lib/translate";
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
    .select("name, tagline, industry, stage, funding_target, is_demo")
    .eq("slug", params.slug)
    .single();

  if (!startup) return {};

  // Metadata is rendered BEFORE the page body, so the body's redirect cannot
  // protect it -- this codebase has already been bitten by exactly that, when
  // an investor's name leaked through the <title> of a redirect shell. When
  // the detail page is members-only and the caller is signed out, the tags
  // carry the company NAME and its TAGLINE and nothing else: a shared link
  // still previews as something rather than a bare URL, while the problem,
  // solution, market and every financial figure stay behind the gate.
  //
  // Marked noindex because this URL answers an anonymous crawler with a
  // redirect to sign-in; indexing it would put a login screen in the results
  // under the company's name. The browse index and the sector pages carry the
  // public SEO instead.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !(await listingDetailPublic())) {
    return {
      robots: { index: false, follow: false },
      title: `${startup.name}: ${startup.tagline}`,
      description: startup.tagline,
      openGraph: {
        title: `${startup.name} | CapitalReach`,
        description: startup.tagline,
        type: "website",
        url: `/startups/${params.slug}`,
      },
      alternates: { canonical: `/startups/${params.slug}` },
    };
  }

  return {
    // A fictional sample company must never appear in a search result.
    ...(startup.is_demo ? { robots: { index: false, follow: false } } : {}),
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

  // The service role reads the full row (column grants hide financials from
  // user-bound clients since 109); this page is the strip point -- what
  // leaves here is exactly what the viewer's entitlement allows.
  const { data: startup } = await createAdminClient()
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

  const { data: { user } } = await supabase.auth.getUser();

  // MEMBERS-ONLY DETAIL (platform_config.public_listing_detail). The browse
  // index stays public -- name, sector, stage, raise, score -- but this page is
  // where the idea lives, and an anonymous reader does not get it. This gate
  // sits in FRONT of every entitlement gate below: nothing about the viewer is
  // resolved and no pageview is recorded until it passes.
  //
  // The one anonymous door that stays open is a share link the founder minted
  // themselves. The token is re-checked against THIS startup here rather than
  // trusted as a query parameter, exactly as the document grant re-checks it
  // further down -- ?share=anything would otherwise be a universal key. That
  // later check is the stricter one (it also requires grants_documents); this
  // one only decides whether the room is open.
  if (!user && !(await listingDetailPublic())) {
    const gateToken = typeof searchParams?.share === "string" ? searchParams.share.slice(0, 64) : null;
    let sharedWithGuest = false;
    if (gateToken) {
      const { data: gateShare } = await createAdminClient()
        .from("round_shares")
        .select("startup_id, expires_at, revoked_at")
        .eq("token", gateToken)
        .maybeSingle();
      sharedWithGuest = !!gateShare
        && gateShare.startup_id === startup.id
        && !gateShare.revoked_at
        && (!gateShare.expires_at || new Date(gateShare.expires_at) > new Date());
    }
    if (!sharedWithGuest) redirect(`/auth/login?redirect=/startups/${params.slug}`);
  }

  // Track pageview (server-side increment). After the gate: a visitor who was
  // bounced to sign-in never saw the listing, and this counter is what the
  // trending badge on the browse index is computed from.
  try { await supabase.rpc("increment_pageview", { startup_id: startup.id }); } catch { /* ok */ }

  // Get current user tier
  const { isLaunch } = await getLaunchStatus();
  let investorTier: SubscriptionTier | null = null;
  let investorId: string | null = null;
  let ndaSigned = false;
  let viewerSuspended = false;
  let viewerIsAdmin = false;
  let viewerRole: string | null = null;

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
    viewerRole = profile?.role ?? null;

    // A founder seat exempts the viewer from the tier wall below, on the
    // reasoning that a founder sizing up the field is not the leak this
    // guards against. That holds for a founder with a LIVE listing. It does
    // not hold for anyone who filled in the onboarding form and stopped: an
    // unapproved listing costs nothing, and without this it bought every
    // company's problem, solution, market and use of funds for free.
    if (profile?.role === "startup") {
      const { data: own } = await supabase
        .from("startups").select("status").eq("owner_id", user.id)
        .eq("status", "active").limit(1).maybeSingle();
      if (!own) viewerRole = "startup_pending";
    }

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
  const { data: related } = await createAdminClient()
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
    // The signed-in USER, not their investor entity. A founder has no
    // investor row, and passing null here made them look anonymous to
    // launch mode -- which locked every founder out of every listing.
    userId: previewing ? null : (user?.id ?? null),
    role: previewing ? ("investor" as const) : viewerIsAdmin ? ("admin" as const) : investorId ? ("investor" as const) : null,
    tier: previewing ? null : investorTier,
    isLaunchMode: isLaunch,
    suspended: previewing ? false : viewerSuspended,
  });

  // The tier wall, distinct from the anonymous wall above. A signed-in free
  // member is already past the login gate, so bouncing them there again would
  // be nonsense -- they get the overview they saw on the card plus a plain
  // upgrade path. Owners, admins and anyone previewing their own listing are
  // never walled out of it. Returned EARLY so the gated prose is never
  // serialised into a payload at all.
  if (!isOwner && !viewerIsAdmin && !previewing && user
      && viewerRole !== "startup"
      && !viewerCaps.viewListingDetail) {
    return (
      <>
        <Navbar />
        <ListingLocked startup={{
          name: startup.name,
          tagline: startup.tagline,
          industry: startup.industry,
          stage: startup.stage,
          funding_target: startup.funding_target,
          country: startup.country,
        }} />
        <Footer />
      </>
    );
  }

  // C33: who else is looking -- only investors who explicitly opted in, and
  // only shown to other investors. Never to the public, never amounts.
  // Gated on the viewer's coInvestorVisibility capability (pro/institution,
  // or everyone under launch mode), derived from viewerCaps above -- which is
  // why this fetch sits after that computation rather than with the other
  // per-viewer reads.
  let coInvestors: Array<{ slug: string; name: string | null; type: string | null }> = [];
  if (investorId && viewerCaps.coInvestorVisibility) {
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
    // A signed-in investor is in the room (preview simulates one) only with
    // the viewDocuments capability -- paid tier, or launch mode via viewerCaps,
    // which under preview is the free tier's. A share-token grant keeps its
    // own path. NDA-gated docs still need the NDA below.
    isInvestor: previewing ? true : !!investorId || shareGrantsDocs,
    canViewDocuments: viewerCaps.viewDocuments || shareGrantsDocs,
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
  // Financials are gated by tier AND (for NDA listings) the NDA. The client
  // only HID them; client-component props serialize into the payload, so a
  // gated viewer could read mrr/arr/users/growth/valuation from view-source.
  // Strip them server-side — the same rule metric history already follows.
  const financialsAllowed = viewerCaps.viewFinancials
    && !(!!startup.require_nda && !ndaSigned && !isOwner && !viewerIsAdmin);
  const showFinancials = financialsAllowed || (isOwner && !previewing) || (viewerIsAdmin && !previewing);
  const safeStartup = {
    ...startup,
    ...(showFinancials ? {} : { mrr: null, arr: null, user_count: null, growth_rate: null, valuation: null, paying_customers: null, runway_months: null, churn_rate: null }),
    founders: protectFounders(startup.founders, identityRevealed),
    documents: (startup.documents ?? []).map((d) => stripLockedUrl(d, docCtx, previewing ? null : shareToken)),
  };

  // Auto-translation. The listing's language is detected from its own prose
  // (fresh every render, so an edited-into-another-language pitch is never
  // stale), and when it differs from the viewer's we hand the client any
  // translation the cache already holds so the page paints translated with no
  // flash. A cold cache just means the client fetches it once.
  const viewerLocale = getLocale();
  const proseFields = collectFields(safeStartup as unknown as Record<string, unknown>, TRANSLATABLE.startup);
  const sourceLocale = detectLanguage(Object.values(proseFields).join("\n"), "en");
  const initialTranslation = (translationAvailable && viewerLocale !== sourceLocale && !previewing)
    ? await readCachedTranslation("startup", startup.id, viewerLocale, proseFields)
    : null;

  // Metric history rides the same gate as the single MRR number: financial
  // tier (or the owner outside preview). Fetched only when it will render, so
  // a gated viewer's payload does not carry the curve either.
  let metricHistory: Array<{ month: string; mrr: number | null; arr: number | null; user_count: number | null; paying_customers: number | null }> = [];
  const ndaBlocksNumbers = !!startup.require_nda && !ndaSigned && !isOwner && !viewerIsAdmin;
  if ((viewerCaps.viewFinancials && !ndaBlocksNumbers) || (isOwner && !previewing) || (viewerIsAdmin && !previewing)) {
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
        relatedStartups={(related ?? []).map((r) => (viewerCaps.viewFinancials && !previewing ? r : stripCardFinancials(r)))}
        updates={isOwner || viewerIsAdmin || !!investorId || previewing ? (updates ?? []) : []}
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
        viewerUserId={previewing ? null : (user?.id ?? null)}
        viewerSuspended={previewing ? false : viewerSuspended}
        previewing={previewing}
        metricHistory={metricHistory}
        identityRevealed={identityRevealed}
        circumventionAcked={previewing ? false : circumventionAcked}
        momentum={momentum}
        coInvestors={coInvestors}
        sourceLocale={sourceLocale}
        initialTranslation={initialTranslation}
        translationAvailable={translationAvailable}
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
