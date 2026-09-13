import { notFound, redirect } from "next/navigation";
import { recordIntroduction } from "@/lib/introductions";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { stripCardFinancials } from "@/lib/browse-data";
import { listingDetailPublic } from "@/lib/listing-visibility";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { ReportButton } from "@/components/shared/report-button";
import WhatWeChecked from "@/components/review/WhatWeChecked";
import { JsonLdScript } from "@/components/shared/json-ld";
import { startupJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { StartupDetailClient } from "@/components/startup/startup-detail-client";
import { stripLockedUrl } from "@/lib/document-access";
import { investorCan } from "@/lib/access";
import { getLaunchStatus } from "@/lib/launchMode";
import { protectFounders } from "@/lib/identity";
import { ListingLocked } from "@/components/startup/listing-locked";
import { getLocale, getTranslator } from "@/lib/locale-server";
import { detectLanguage } from "@/lib/detect-language";
import { TRANSLATABLE, collectFields, readCachedTranslation, translationAvailable } from "@/lib/translate";
import type { Startup, SubscriptionTier } from "@/types";
import type { Metadata } from "next";
import type { StartupCardData } from "@/components/startup/startup-card";

// Dynamic per request, declared honestly: the page reads cookies()
// (createServerSupabaseClient) before anything else, so ISR never engaged
// and the old `revalidate = 120` export was inert. Making it explicit also
// protects the per-request pageview increment below from a future refactor
// that removes the cookie read and would silently re-enable a stale cache.
export const dynamic = "force-dynamic";

interface Props {
  params: { slug: string };
  searchParams?: { preview?: string; share?: string };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient();

  // Metadata is rendered BEFORE the page body, so the body's redirect cannot
  // protect it -- this codebase has already been bitten by exactly that, when
  // an investor's name leaked through the <title> of a redirect shell. While
  // the detail page is members-only, an anonymous caller's tags are GENERIC:
  // this used to carry the company name and tagline as a share-preview
  // courtesy, but an anonymous response naming a company was the one
  // exception to the masking rule every other anonymous surface follows
  // (sector teaser, pulse, sitemap, the page itself), and it doubled as a
  // slug-existence oracle. The row is not read at all on the tokenless
  // branch, so a real slug and a fake one answer identically. The one
  // exception is founder consent itself: a live share token minted for THIS
  // startup names the unfurl, validated exactly as the page body's gate
  // validates it (same startup, not revoked, not expired), and an invalid
  // token answers identically to no token. Flipping public_listing_detail to
  // "open" restores named previews for everyone with the page.
  //
  // noindex because this URL answers an anonymous crawler with a redirect to
  // sign-in; the browse index and sector pages carry the public SEO instead.
  const { data: { user } } = await supabase.auth.getUser();
  let guestViaShareToken = false;
  if (!user && !(await listingDetailPublic())) {
    const gateToken = typeof searchParams?.share === "string" ? searchParams.share.slice(0, 64) : null;
    if (gateToken) {
      const admin = createAdminClient();
      const [{ data: target }, { data: gateShare }] = await Promise.all([
        admin.from("startups").select("id").eq("slug", params.slug).maybeSingle(),
        admin.from("round_shares").select("startup_id, expires_at, revoked_at").eq("token", gateToken).maybeSingle(),
      ]);
      guestViaShareToken = !!target && !!gateShare
        && gateShare.startup_id === target.id
        && !gateShare.revoked_at
        && (!gateShare.expires_at || new Date(gateShare.expires_at) > new Date());
    }
    if (!guestViaShareToken) {
      return {
        robots: { index: false, follow: false },
        title: "A company raising on CapitalReach",
        description: "Sign in to view this listing.",
        openGraph: {
          title: "CapitalReach",
          description: "Founders raising. Investors deploying. Deals that close in one place.",
          type: "website",
          url: `/startups/${params.slug}`,
        },
        alternates: { canonical: `/startups/${params.slug}` },
      };
    }
  }

  // Admin client: the members-only case returned above, so whoever reaches
  // this read is entitled to named metadata -- a member, a guest holding a
  // live share token, or anyone once the flag is "open". The 129 policies
  // stop the anon session key from reading startups at all, which would
  // silently blank this branch in open mode.
  const { data: startup } = await createAdminClient()
    .from("startups")
    .select("name, tagline, industry, stage, funding_target, is_demo")
    .eq("slug", params.slug)
    .single();

  if (!startup) return {};

  return {
    // A fictional sample company must never appear in a search result. A
    // token-bearing share URL must not enter one either: the token in the
    // address is the key to the room, and the canonical below already points
    // crawlers at the tokenless URL.
    ...(startup.is_demo || guestViaShareToken ? { robots: { index: false, follow: false } } : {}),
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

export default async function StartupDetailPage({ params, searchParams }: Props) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // MEMBERS-ONLY DETAIL (platform_config.public_listing_detail). The browse
  // index stays public -- name, sector, stage, raise, score -- but this page is
  // where the idea lives, and an anonymous reader does not get it. This gate
  // sits in FRONT of everything, including the row read: an anonymous visitor
  // with no share token is bounced BEFORE the slug is resolved, so a live
  // listing and a fake slug answer identically (the old order -- notFound
  // first, redirect second -- let a signed-out caller confirm which slugs were
  // real listings by the shape of the refusal).
  //
  // The one anonymous door that stays open is a share link the founder minted
  // themselves. The token is validated against the startup the row names,
  // never trusted as a bare parameter, and an invalid token gets the same
  // login redirect as no token -- not a 404 -- for the same oracle reason.
  const detailPublic = await listingDetailPublic();
  const gateToken = typeof searchParams?.share === "string" ? searchParams.share.slice(0, 64) : null;
  if (!user && !detailPublic && !gateToken) {
    redirect(`/auth/login?redirect=/startups/${params.slug}`);
  }

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

  // The OWNER may preview their own non-active listing: every founder starts
  // in pending_review, the dashboard's "View listing" and "Preview as
  // investor" links point here, and the hard 404 hit them exactly when they
  // most wanted to check what the reviewer would see.
  const ownerPreviewingInactive =
    !!startup && startup.status !== "active" && !!user && startup.owner_id === user.id;
  if (!startup || (startup.status !== "active" && !ownerPreviewingInactive)) {
    // A guest holding a token gets the redirect, not the 404, when the slug is
    // dead -- an anonymous caller must not learn existence from the refusal.
    if (!user && !detailPublic) redirect(`/auth/login?redirect=/startups/${params.slug}`);
    notFound();
  }

  // Token re-checked against THIS startup, exactly as the document grant
  // re-checks it further down -- ?share=anything would otherwise be a
  // universal key. That later check is the stricter one (it also requires
  // grants_documents); this one only decides whether the room is open.
  if (!user && !detailPublic) {
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
  // trending badge on the browse index is computed from. Service role, not
  // the viewer's client: migration 130 revoked anon EXECUTE, so a share-link
  // guest (and every anonymous visitor if detail ever goes public) counted
  // nothing when the RPC ran as the viewer. Counting follows page access,
  // which the gate above has already decided.
  try { await createAdminClient().rpc("increment_pageview", { startup_id: startup.id }); } catch { /* ok */ }

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

      // Two records, and they are not the same thing. startup_views is a daily
      // log for the founder's own analytics. introductions is the row a fee
      // claim rests on -- first contact, channel, terms version, tail expiry --
      // and until now nothing wrote it for the plainest circumvention there is:
      // browse, read the name, google it, write to the founder directly.
      //
      // recordIntroduction is idempotent and keeps the EARLIEST contact, so a
      // later message or NDA does not overwrite the day they actually found the
      // company here, and a hundred page views do not become a hundred rows.
      if (investorId) {
        try {
          const admin = createAdminClient();
          await admin.from("startup_views").insert({
            startup_id: startup.id,
            investor_id: investorId,
          });
        } catch { /* duplicate view for today — nothing to record */ }
        await recordIntroduction({
          startupId: startup.id,
          investorId,
          channel: "listing_view",
        }).catch(() => null);
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
    // Server-only columns, stripped UNCONDITIONALLY. The row is read with the
    // service role and spread into client props, so anything not removed here
    // ships to every member's browser regardless of what renders: the audit
    // found founder_attestation_ip sitting in the page payload. The register
    // columns are the circumvention route the fee model exists to close, and
    // an IP beside a signature is evidence for a dispute, not page data.
    founder_attestation_ip: null,
    founder_attestation_sha256: null,
    verification_checks: null,
    verified_by: null,
    legal_entity_name: null,
    register_type: null,
    register_number: null,
    last_review_id: null,
    // For a SAFE round the cap IS the valuation and the discount sets the
    // entry price, so they belong in the same strip as `valuation` -- the
    // client's round-arithmetic block renders safe_cap/safe_discount with no
    // financials guard of its own, which leaked the SAFE valuation to a paid
    // investor who had not signed the NDA.
    ...(showFinancials ? {} : { mrr: null, arr: null, user_count: null, growth_rate: null, valuation: null, paying_customers: null, runway_months: null, churn_rate: null, safe_cap: null, safe_discount: null, valuation_type: null, instrument: null }),
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

  const tServer = await getTranslator(getLocale());

  return (
    <>
      <Navbar />
      {/* The not-live strip for the owner's preview of a draft or
          pending listing -- without it the preview is indistinguishable
          from being live. */}
      {ownerPreviewingInactive && (
        <div style={{ background: "var(--cr-copper-bg)", borderBottom: "1px solid var(--cr-copper-br)", padding: "10px 24px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)" }}>
          {startup.status === "pending_review" ? tServer("dashboard.profileUnderReview") : tServer("dashboard.statusDraftTitle")}
        </div>
      )}
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
      {/* Unconditional. Not gated on tier, on the NDA, or on a review
          existing: a viewer who reaches the listing body reaches this, and the
          module states the absence of a review as plainly as it states one.
          Anything that hides it in some states turns silence into a pass. */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 24px 32px" }}>
        <WhatWeChecked subjectType="startup" subjectId={safeStartup.id} />
      </div>
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
