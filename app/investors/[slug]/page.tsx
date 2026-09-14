import { notFound, redirect } from "next/navigation";
import { countryLabel } from "@/lib/country-label";
import { DemoBadge } from "@/components/shared/demo-badge";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { TrustPanel } from "@/components/shared/trust-panel";
import { effectiveTrustLevel } from "@/lib/trust";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Navbar } from "@/components/shared/navbar";
import { TargetButton } from "@/components/investors/target-button";
import { InterestedButton } from "@/components/shared/interested-button";
import { FounderOutreach } from "@/components/investors/founder-outreach";
import { resolveEntity } from "@/lib/membership";
import { mayPairContact } from "@/lib/contact-policy";
import { createAdminClient } from "@/lib/supabase-server";
import { Footer } from "@/components/shared/footer";
import { ReportButton } from "@/components/shared/report-button";
import WhatWeChecked from "@/components/review/WhatWeChecked";
import { JsonLdScript } from "@/components/shared/json-ld";
import { TranslatedContent, T } from "@/components/shared/translated-content";
import { investorJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Linkedin, Globe, Twitter, Eye, Pencil, Handshake } from "lucide-react";
import { formatCurrency, getInitials, STAGE_LABELS } from "@/lib/utils";
import { getLocale, getTranslator } from "@/lib/locale-server";
import { detectLanguage } from "@/lib/detect-language";
import { TRANSLATABLE, collectFields, readCachedTranslation, translationAvailable } from "@/lib/translate";
import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";

interface Props { params: { slug: string } }

// ── House register primitives (style objects only) ──────────────────────────

// Ruled-label companion: the small uppercase label above a value.
const LABEL: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)",
};

// Badge: Label type, 3px radius, hairline border -- the register's one chip shape.
const BADGE: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  padding: "3px 8px", borderRadius: "3px",
  border: "1px solid var(--cr-paper-4)", background: "var(--cr-paper-2)",
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--cr-ink-3)",
  whiteSpace: "nowrap", textDecoration: "none",
};

const BADGE_COPPER: CSSProperties = {
  ...BADGE,
  border: "1px solid var(--cr-copper-br)", background: "var(--cr-copper-bg)",
  color: "var(--cr-copper)",
};

// Interactive chips keep Label type but reach a 40px touch target.
const BADGE_ACTION: CSSProperties = {
  ...BADGE_COPPER, minHeight: "40px", padding: "0 12px",
};

const DATA: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums",
};

// The ruled strip: the container carries the top and left hairlines, each
// cell its own right and bottom, so any cell count closes into one ruled
// block at any wrap -- same idiom as the startup page's metric strips.
const STRIP: CSSProperties = {
  borderTop: "1px solid var(--cr-rule)", borderLeft: "1px solid var(--cr-rule)",
};

// Every figure sits on the cell's right edge -- a ledger column, not a form
// field -- and every label speaks in the one LABEL voice above it.
const CELL: CSSProperties = {
  borderRight: "1px solid var(--cr-rule)", borderBottom: "1px solid var(--cr-rule)",
  padding: "12px 16px", minWidth: 0, textAlign: "right",
};

// The three voices a cell value can carry: a mono figure, a mono span
// (stage ranges, country names), and plain text for prose-valued facts.
const CELL_FIGURE: CSSProperties = {
  ...DATA, fontWeight: 700, fontSize: "20px", lineHeight: 1.2, color: "var(--cr-ink)",
};
const CELL_SPAN: CSSProperties = {
  ...DATA, fontWeight: 600, fontSize: "13px", lineHeight: 1.4,
  textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--cr-ink)",
};
const CELL_TEXT: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px",
  lineHeight: 1.5, color: "var(--cr-ink-2)",
};

function Cell({ label, value, sub, valueStyle = CELL_FIGURE }: {
  label: string; value: ReactNode; sub?: ReactNode; valueStyle?: CSSProperties;
}) {
  return (
    <div style={CELL}>
      <p style={{ ...LABEL, marginBottom: "8px" }}>{label}</p>
      <p style={valueStyle}>{value}</p>
      {sub != null && (
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", lineHeight: 1.5, color: "var(--cr-ink-4)", marginTop: "4px" }}>{sub}</p>
      )}
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createServerSupabaseClient();
  // The page body login-gates, but metadata renders first -- without the
  // same check the investor's NAME leaks through the <title> of the
  // redirect shell (audit finding). Signed-out visitors get a generic tag.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { title: "Investor profile", robots: { index: false } };
  const { data } = await supabase
    .from("investors")
    .select("slug, type, bio, display_name, firm_name, is_demo")
    .eq("slug", params.slug)
    .single();
  if (!data) return {};
  const name = data.display_name || data.slug;
  const firm = data.firm_name ? ` · ${data.firm_name}` : "";
  return {
    // Sample profiles never reach a search result.
    ...(data.is_demo ? { robots: { index: false, follow: false } } : {}),
    title: `${name}${firm} — Investor on CapitalReach`,
    description: data.bio || `${data.type} investor on CapitalReach`,
    alternates: { canonical: `/investors/${params.slug}` },
    openGraph: { title: `${name}${firm} | CapitalReach`, description: data.bio ?? undefined, type: "website", url: `/investors/${params.slug}` },
  };
}

export default async function InvestorProfilePage({ params }: Props) {
  // Same rule as the directory: investor identities are for signed-in users.
  {
    const gate = await createServerSupabaseClient();
    const { data: { user: gateUser } } = await gate.auth.getUser();
    if (!gateUser) redirect(`/auth/login?redirect=/investors/${params.slug}`);
  }
  const supabase = await createServerSupabaseClient();
  const t = await getTranslator(getLocale());
  // Renders before the dictionary has the newer keys; a missing key must not
  // put a dot-path where a label belongs (same pattern as WhatWeChecked).
  const tf = (key: string, fallback: string, vars?: Record<string, string | number>) => {
    const out = t(key, vars);
    return out === key ? fallback : out;
  };

  const INVESTOR_TYPE_LABELS: Record<string, string> = {
    angel: t("investorProfile.angelInvestor"),
    vc: t("investorProfile.ventureCapital"),
    family_office: t("investorProfile.familyOffice"),
    corporate: t("investorProfile.corporateInvestor"),
    syndicate: t("investorProfile.syndicate"),
  };
  // The DB stores lowercase snake_case; older rows may carry other casings.
  const typeLabel = (raw: string | null | undefined) =>
    raw ? (INVESTOR_TYPE_LABELS[raw.toLowerCase().replace(/ /g, "_")] ?? raw) : "";

  // Reads `investors` only. This page is public, and `profiles` is not: it
  // holds emails, subscription tiers and Stripe ids, and is now restricted to
  // authenticated sessions (migration 019). Everything below already lived on
  // `investors` under its own column names -- the old owner:profiles(...) join
  // was reading a duplicate copy of the same data, and pulling `email` onto a
  // public page while it was at it.
  const { data: investor } = await supabase
    .from("investors")
    .select("*")
    .eq("slug", params.slug)
    .single();

  if (!investor) notFound();

  // Who is looking? Investors had no way to see their own listing as a founder
  // sees it -- the only view of their profile was the settings form, which
  // shows fields rather than the result. Knowing the viewer also lets the CTA
  // stop inviting people to do things that make no sense for them.
  const { data: { user } } = await supabase.auth.getUser();
  const isOwnProfile = !!user && user.id === investor.owner_id;

  // Visibility gate. This page fetched by slug with no filter, so an unlisted
  // (is_public=false) or off-platform (is_external) investor profile was served
  // in full -- firm, thesis, portfolio, and for external rows the third party's
  // contact email and notes -- to anyone who guessed the slug. Every other read
  // path already filters on is_public=true AND is_external=false; this one is
  // the gap. Only the row's own owner may load it unlisted; everyone else gets
  // the same 404 as a missing row. External rows have no owner, so they 404 for
  // all (admins use /admin, not the public slug).
  if ((!investor.is_public || investor.is_external) && !isOwnProfile) {
    notFound();
  }

  // Record the view (migration 107) -- the investor-side mirror of
  // startup_views. Any signed-in viewer except the owner counts; the unique
  // index collapses repeat visits to one row per viewer per UTC day, and the
  // conflict is swallowed the same way the startup page swallows its own.
  if (user && !isOwnProfile) {
    await createAdminClient()
      .from("investor_views")
      .insert({ investor_id: investor.id, viewer_id: user.id })
      .then(undefined, () => {});
  }

  // If the viewer is a founder, their own deal with this investor. Same rule
  // as the startup profile: fetched with the caller's client so RLS decides,
  // only the viewer's own deal, never shown to the public.
  type ViewerDeal = { id: string; status: string };
  let viewerDeal: ViewerDeal | null = null;
  // Founder viewers also get the target-list button (migration 031); RLS
  // scopes the lookup to the caller's own startup.
  let viewerIsFounder = false;
  let viewerMayMessage = false;
  let viewerIsInvestor = false;
  let viewerTargeted = false;
  if (user && !isOwnProfile) {
    // Fellow investors get direct outreach (098): co-investing starts with
    // a conversation, and small-cheque investors hunt in packs.
    const invMembership = await resolveEntity(user.id, "investor");
    if (invMembership && invMembership.entityId !== investor.id) viewerIsInvestor = true;
    // resolveEntity rather than an owner_id lookup: team members managing the
    // raise get the same button and the same initial state as the owner --
    // /api/targets already treats them alike, and an owner-only check here
    // made the button lie to (or hide from) exactly the people invited to
    // help run the round. The target lookup goes through the service role for
    // the same reason; RLS on investor_targets covers only the owner.
    const membership = await resolveEntity(user.id, "startup");
    if (membership) {
      viewerIsFounder = true;
      const admin = createAdminClient();
      const [{ data: deal }, { data: target }] = await Promise.all([
        supabase
          .from("deals")
          .select("id, status")
          .match({ startup_id: membership.entityId, investor_id: investor.id })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("investor_targets")
          .select("id")
          .match({ startup_id: membership.entityId, investor_id: investor.id })
          .maybeSingle(),
      ]);
      viewerDeal = (deal as ViewerDeal | null) ?? null;
      viewerTargeted = !!target;
      // The same verdict /api/messages/start applies, asked here so the
      // control is absent rather than present-and-refused. A deal ROW existing
      // is not the test: the rule is a deal both sides have signed, and
      // viewerDeal is true from the moment one is opened.
      viewerMayMessage = (await mayPairContact({
        startupId: membership.entityId,
        investorId: investor.id,
        side: "startup",
      })).allowed;
    }
  }

  // An open verification case, so an unbadged profile can read as "in
  // progress" rather than as a permanent blank -- during the founding stage
  // most unbadged accounts are simply queued behind human review.
  //
  // Read with the service role because the RLS policy on verification_cases is
  // owner-only, so no other viewer could see the row at all. Exactly one bit
  // leaves this query: whether a case is open. risk_score and risk_flags are
  // revoked from client keys by migration 111 and are never selected here.
  //
  // The level is derived here rather than imported from trust-panel: every
  // export of a "use client" module is a client reference, and a server
  // component may not call one. Pre-ladder rows carry no trust_level, and
  // migration 111 settles a manual verification at level 2.
  const rawTrust = investor.trust_level > 0 ? investor.trust_level : (investor.verified_at ? 2 : 0);
  const effectiveLevel = effectiveTrustLevel(rawTrust, investor.trust_expires_at);
  let verificationCaseOpen = false;
  if (effectiveLevel === 0) {
    const { data: openCase } = await createAdminClient()
      .from("verification_cases")
      .select("id")
      .eq("subject_type", "investor")
      .eq("subject_id", investor.id)
      .in("status", ["submitted", "in_review", "needs_more"])
      .limit(1)
      .maybeSingle();
    verificationCaseOpen = !!openCase;
  }
  const legacyChecks = investor.verification_checks as { checks?: string[]; at?: string } | null;
  // A standing rung, a case in flight, or -- for the owner alone -- a lapse
  // worth acting on. Everyone else sees plain absence, never a grey scold.
  const showTrust = effectiveLevel > 0 || verificationCaseOpen || (rawTrust > 0 && isOwnProfile);

  const displayName = investor.display_name || investor.slug;
  const memberSince = investor.created_at
    ? new Date(investor.created_at).toLocaleDateString(getLocale(), { month: "long", year: "numeric" })
    : null;
  const portfolio: Array<{ name: string; stage?: string; outcome?: string }> =
    Array.isArray(investor.portfolio_json)
      ? (investor.portfolio_json as Array<{ name: string; stage?: string; outcome?: string }>).filter((c) => c?.name)
      : [];

  // The mandate strip's derived figures. Stages resolve through the same
  // labels the startup surfaces use and sort into ladder order, so the span
  // reads "Pre-Seed – Series A" whatever order the settings form saved them.
  const STAGE_ORDER = ["pre-seed", "seed", "series_a", "series_b_plus"];
  const stageName = (s: string) => STAGE_LABELS[s] ?? s.replace(/_/g, " ");
  const stagesSorted = [...((investor.stages ?? []) as string[])].sort(
    (a, b) => ((STAGE_ORDER.indexOf(a) + 1) || 99) - ((STAGE_ORDER.indexOf(b) + 1) || 99),
  );
  const stageSpan =
    stagesSorted.length > 1
      ? `${stageName(stagesSorted[0])} – ${stageName(stagesSorted[stagesSorted.length - 1])}`
      : stagesSorted.length === 1 ? stageName(stagesSorted[0]) : null;
  const industries = (investor.industries ?? []) as string[];
  const geographies = (investor.geography ?? []) as string[];
  const thesis: string | null = investor.investment_thesis || null;
  // Under ~140 characters the header lede holds the whole thesis; longer ones
  // clamp there and run in full as prose in their own section below.
  const thesisIsLong = !!thesis && thesis.length > 140;

  // Similar investors — others who overlap on industry or stage, so a founder
  // browsing one lead can find the rest of the shortlist without going back.
  const overlapIndustries = (investor.industries ?? []).slice(0, 6);
  const overlapStages = (investor.stages ?? []).slice(0, 6);
  let similar: Array<{ slug: string; display_name: string | null; firm_name: string | null; type: string; industries: string[] | null }> = [];
  if (overlapIndustries.length || overlapStages.length) {
    const admin = createAdminClient();
    const orParts: string[] = [];
    // Drop any value carrying a character that would break the PostgREST array
    // literal or the top-level .or() separator, then quote what remains.
    const safe = (arr: string[]) => arr.filter((v) => !/[{}"(),\\]/.test(v));
    const inds = safe(overlapIndustries);
    const stgs = safe(overlapStages);
    if (inds.length) orParts.push(`industries.ov.{${inds.map((v) => `"${v}"`).join(",")}}`);
    if (stgs.length) orParts.push(`stages.ov.{${stgs.map((v) => `"${v}"`).join(",")}}`);
    if (orParts.length) {
      const { data } = await admin
        .from("investors")
        .select("slug, display_name, firm_name, type, industries")
        .neq("id", investor.id)
        // Service-role query bypasses RLS, so filter explicitly: never surface an
        // unlisted or off-platform investor as a "similar" suggestion.
        .eq("is_public", true)
        .eq("is_external", false)
        .or(orParts.join(","))
        .limit(4);
      similar = data ?? [];
    }
  }

  // Auto-translation: detect the profile's language from its own prose and, if
  // it differs from the viewer's, hand down any cached translation so the page
  // paints translated with no flash. Cold cache → the client fetches it once.
  const viewerLocale = getLocale();
  const proseFields = collectFields(investor as unknown as Record<string, unknown>, TRANSLATABLE.investor);
  const sourceLocale = detectLanguage(Object.values(proseFields).join("\n"), "en");
  const initialTranslation = (translationAvailable && viewerLocale !== sourceLocale)
    ? await readCachedTranslation("investor", investor.id, viewerLocale, proseFields)
    : null;

  return (
    <>
      <Navbar />
      {/* An investor's own words, automatically read in the visitor's language
          when they differ — always labelled, with the original one click away. */}
      <TranslatedContent entityType="investor" entityId={investor.id}
        sourceLocale={sourceLocale} initialFields={initialTranslation} available={translationAvailable}>
      <main className="container mx-auto px-4 py-12 max-w-3xl" style={{ background: "var(--cr-paper)" }}>

        {/* Back nav */}
        <Link href="/investors" className="inline-flex items-center gap-1.5 min-h-[40px] text-sm text-cr-i4 hover:text-cr-i2 mb-8 transition-colors">
          ← {t("investorProfile.back")}
        </Link>

        {/* ── Self-preview ──────────────────────────────────────────────────
            An investor's only previous view of their own listing was the
            settings form. This is the page founders actually judge them on. */}
        {isOwnProfile && (
          <div className="flex items-center justify-between gap-4 px-4 py-2 mb-6"
            style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px" }}>
            <div className="flex items-center gap-2 min-w-0">
              <Eye className="h-4 w-4 flex-shrink-0" style={{ color: "var(--cr-copper)" }} />
              <p className="text-cr-cu-l" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px" }}>{t("investorProfile.selfPreview")}</p>
            </div>
            <Link
              href="/dashboard/investor/settings"
              className="inline-flex items-center gap-1.5 min-h-[40px] flex-shrink-0"
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none" }}
            >
              <Pencil className="h-3.5 w-3.5" /> {t("investorProfile.editProfile")}
            </Link>
          </div>
        )}

        {/* ── Profile header ─────────────────────────────────────────────
            The letterhead: firm eyebrow, the name in the display voice with
            room around it, the meta line quiet underneath. Everything else
            in the header sits a register below the name. */}
        <header className="flex flex-col sm:flex-row items-start gap-6 sm:gap-8">
          <Avatar className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0">
            <AvatarFallback className="bg-cr-copper/15 text-cr-cu-l text-2xl"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700 }}>
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 w-full">
            {investor.firm_name && (
              <p style={{ ...DATA, fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "12px" }}>
                {investor.firm_name}
              </p>
            )}
            {/* The badge is a sibling of the name, not a child of it: it opens
                a panel, and a dialog nested inside an h1 is neither valid nor
                readable to a screen reader announcing the heading. */}
            <div className="flex items-center flex-wrap gap-x-3 gap-y-2" style={{ marginBottom: "8px" }}>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(30px, 5vw, 44px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--cr-ink)" }}>
                {displayName}
              </h1>
              {showTrust && (
                <VerifiedBadge
                  kind="investor"
                  checks={legacyChecks}
                  verifiedAt={investor.verified_at}
                  trustLevel={investor.trust_level}
                  trustReviewedAt={investor.trust_reviewed_at}
                  trustExpiresAt={investor.trust_expires_at}
                  caseOpen={verificationCaseOpen}
                  isOwner={isOwnProfile}
                  panel={
                    <TrustPanel
                      subject="investor"
                      level={investor.trust_level}
                      reviewedAt={investor.trust_reviewed_at}
                      expiresAt={investor.trust_expires_at}
                      legacyChecks={legacyChecks}
                      verifiedAt={investor.verified_at}
                      caseOpen={verificationCaseOpen}
                      isOwner={isOwnProfile}
                    />
                  }
                />
              )}
            </div>
            {/* The meta line: what kind of cheque this is and how long the
                account has stood, quiet under the name. One fact, one place:
                the type chip and the floating member-since line both lived
                elsewhere before and said the same things louder. */}
            {(typeLabel(investor.type) || memberSince) && (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", letterSpacing: "0.01em", color: "var(--cr-ink-4)", marginBottom: "16px" }}>
                {[
                  typeLabel(investor.type),
                  memberSince ? t("investorProfile.memberSince", { date: memberSince }) : null,
                ].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {viewerDeal && (
                // Same pill as the startup profile: the two ends of a deal
                // should both show it. Wording reuses the kanban's own column
                // labels so profile and pipeline never disagree.
                <Link href="/deals" style={BADGE_ACTION}>
                  <Handshake className="h-3 w-3" />
                  {t("startupDetail.inYourPipeline")}{" — "}
                  {viewerDeal.status === "intro" ? t("deals.colIntro")
                    : viewerDeal.status === "due_diligence" ? t("dashboard.dueDiligence")
                    : viewerDeal.status === "term_sheet" ? t("deals.colTermSheet")
                    : viewerDeal.status === "closed" ? t("deals.colClosed")
                    : t("deals.colPassed")}
                </Link>
              )}
              {viewerIsFounder && (
                <TargetButton investorId={investor.id} initiallyTargeted={viewerTargeted} />
              )}
              {viewerIsFounder && !viewerDeal && (
                <InterestedButton targetType="investor" targetId={investor.id} />
              )}
              {investor.booking_url && user && (
                <a href={investor.booking_url} target="_blank" rel="noopener noreferrer" style={BADGE_ACTION}>
                  {t("startupDetail.bookCall")}
                </a>
              )}
              {investor.is_demo && <span className="inline-flex align-middle"><DemoBadge /></span>}
              {investor.subscription_tier !== "free" && (
                <span style={BADGE_COPPER}>
                  {investor.subscription_tier === "pro_investor" ? t("investorProfile.tierProInvestor") :
                   investor.subscription_tier === "institutional" ? t("investorProfile.tierInstitutional") :
                   String(investor.subscription_tier).replace(/_/g, " ")}
                </span>
              )}
              {/* One badge per fact. lead_rounds and the profiles copy
                  (lead_investor) are the same flag, and investor_type was
                  rendering the raw enum ("family_office") directly beneath the
                  label-mapped version above. */}
              {investor.lead_rounds && (
                <span style={BADGE}>{t("investors.leadsRounds")}</span>
              )}
            </div>
            {/* B23: founder outbound — message / add to pipeline, right here. */}
            {viewerIsFounder && !isOwnProfile && (
              <FounderOutreach investorId={investor.id} investorName={displayName} hasDeal={!!viewerDeal} canMessage={viewerMayMessage} />
            )}
            {/* Investor to investor is gone rather than gated, for the same
                reason founder to founder is: two investors cannot sign a deal
                with each other, so the channel had no route to being earned.
                /api/messages/start refuses the pair too. */}
            {/* The thesis line, in the display voice: the sentence that says
                what this cheque is for, before any figure. A long thesis
                clamps here and runs in full as prose in its own section --
                the standfirst pattern, so the clamp never swallows text that
                appears nowhere else. */}
            {thesis && (
              <p style={{
                fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 400,
                fontSize: "clamp(17px, 2.6vw, 21px)", lineHeight: 1.5, color: "var(--cr-ink-2)",
                maxWidth: "46ch", margin: "8px 0 16px",
                display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden",
              }}>
                <T field="investment_thesis">{thesis}</T>
              </p>
            )}
            {investor.bio && (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", lineHeight: 1.7, color: "var(--cr-ink-3)", maxWidth: "65ch" }}>
                <T field="bio">{investor.bio}</T>
              </p>
            )}

            {/* Social / web links */}
            <div className="flex flex-wrap gap-x-4 gap-y-0 mt-2">
              {investor.linkedin_url && (
                <a href={investor.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[40px] text-sm text-cr-i3 hover:text-cr-copper transition-colors">
                  <Linkedin className="h-4 w-4" /> LinkedIn
                </a>
              )}
              {investor.twitter_url && (
                <a href={investor.twitter_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[40px] text-sm text-cr-i3 hover:text-cr-copper transition-colors">
                  <Twitter className="h-4 w-4" /> Twitter / X
                </a>
              )}
              {investor.website && (
                <a href={investor.website} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-[40px] text-sm text-cr-i3 hover:text-cr-copper transition-colors">
                  <Globe className="h-4 w-4" /> {t("investorProfile.website")}
                </a>
              )}
            </div>
          </div>
        </header>

        {/* ── Mandate ─────────────────────────────────────────────────────
            What this cheque is for, as one ruled strip: check size, stages,
            sectors, geography, board seats, follow-on and languages together,
            every figure on the ledger edge, every label in the one voice.
            These lived as a strip plus two sections of scattered pairs
            before; a founder rules this investor in or out from one block
            now. Only cells that HAVE values render. */}
        {(investor.min_check || investor.max_check || stageSpan || industries.length > 0 || geographies.length > 0 || investor.board_seat_pref || investor.follow_on_policy || (investor.languages ?? []).length > 0) && (
          <section className="mt-12 pt-8" style={{ borderTop: "1px solid var(--cr-rule)" }}>
            <div className="ruled-label" style={{ marginBottom: "16px" }}>{tf("investorProfile.mandate", "Mandate")}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3" style={STRIP}>
              {(investor.min_check || investor.max_check) && (
                <Cell
                  label={t("investors.checkSize")}
                  value={investor.min_check
                    ? `${formatCurrency(investor.min_check, true)} – ${investor.max_check ? formatCurrency(investor.max_check, true) : t("common.open")}`
                    : `${tf("investorProfile.upTo", "Up to")} ${formatCurrency(investor.max_check ?? 0, true)}`}
                />
              )}
              {stageSpan && (
                <Cell label={t("investorProfile.stagesLabel")} value={stageSpan} valueStyle={CELL_SPAN} />
              )}
              {industries.length > 0 && (
                <Cell label={t("investorProfile.industriesLabel")} value={industries.length} sub={industries.join(", ")} />
              )}
              {geographies.length > 0 && (
                <Cell
                  label={tf("investorProfile.geographyLabel", "Geography")}
                  value={countryLabel(t, geographies[0])}
                  valueStyle={CELL_SPAN}
                  sub={geographies.length > 1 ? geographies.slice(1).map((g) => countryLabel(t, g)).join(", ") : undefined}
                />
              )}
              {investor.board_seat_pref && (
                <Cell label={t("investorProfile.boardSeat")} value={investor.board_seat_pref} valueStyle={CELL_TEXT} />
              )}
              {investor.follow_on_policy && (
                <Cell label={t("investorProfile.followOn")} value={investor.follow_on_policy} valueStyle={CELL_TEXT} />
              )}
              {(investor.languages ?? []).length > 0 && (
                <Cell label={t("investorProfile.languagesLabel")} value={(investor.languages ?? []).join(", ")} valueStyle={CELL_TEXT} />
              )}
            </div>
          </section>
        )}

        {/* ── Investment thesis ──────────────────────────────────────────
            Only when the header lede could not hold all of it. Set at a
            reading measure with real leading: a thesis is the one paragraph
            a founder actually reads. */}
        {thesis && thesisIsLong && (
          <section className="mt-12 pt-8" style={{ borderTop: "1px solid var(--cr-rule)" }}>
            <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("investors.thesis")}</div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "16px", lineHeight: 1.75, color: "var(--cr-ink-2)", maxWidth: "65ch" }}>
              <T field="investment_thesis">{thesis}</T>
            </p>
          </section>
        )}

        {/* ── Track record ────────────────────────────────────────────────
            Same strip anatomy as the mandate: only metrics that HAVE values
            render. portfolio_count is deliberately not repeated here -- it
            is the same number as number_of_investments. Member-since lives
            in the header meta line now, not as a floating footnote. */}
        {(investor.aum || investor.number_of_investments || investor.avg_hold_period) && (
          <section className="mt-12 pt-8" style={{ borderTop: "1px solid var(--cr-rule)" }}>
            <div className="ruled-label" style={{ marginBottom: "16px" }}>{tf("investorProfile.trackRecord", "Track record")}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3" style={STRIP}>
              {investor.aum && (
                <Cell label={t("investorProfile.aumFundSize")} value={investor.aum} />
              )}
              {investor.number_of_investments != null && (
                <Cell label={t("investorProfile.investmentsLabel")} value={investor.number_of_investments} />
              )}
              {investor.avg_hold_period && (
                <Cell label={t("investorProfile.avgHold")} value={investor.avg_hold_period} />
              )}
            </div>
          </section>
        )}

        {/* ── Intro video ────────────────────────────────────────────────── */}
        {/* Intro video — a paid feature that stays paid: rendered only while
            the plan still includes it, so a downgrade retires the video
            without touching the row. */}
        {investor.video_url && (investor.subscription_tier === "pro" || investor.subscription_tier === "institution") && (
          <section className="mt-12 pt-8" style={{ borderTop: "1px solid var(--cr-rule)" }}>
            <div className="ruled-label" style={{ marginBottom: "16px" }}>{t("investorProfile.introVideo")}</div>
            <div style={{ aspectRatio: "16/9", borderRadius: "4px", overflow: "hidden", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)" }}>
              <iframe
                src={investor.video_url.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")}
                style={{ width: "100%", height: "100%" }}
                allowFullScreen
              />
            </div>
          </section>
        )}

        {/* ── Portfolio companies ────────────────────────────────────────── */}
        {/* Ledger rows with a numbered rail, not a grid of boxes. Past six
            rows the ledger folds behind a native disclosure -- interaction
            with no client component -- and the count is stated either way,
            so a folded list never understates a record. */}
        {portfolio.length > 0 && (() => {
          const row = (co: { name: string; stage?: string; outcome?: string }, i: number) => (
            <div key={i} className="flex items-center justify-between gap-3 flex-wrap"
              style={{ padding: "12px 0", borderTop: i > 0 ? "1px solid var(--cr-rule)" : "none" }}>
              <div className="flex items-baseline gap-3 min-w-0">
                <span style={{ ...DATA, fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", minWidth: "20px", flexShrink: 0 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="truncate" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>{co.name}</span>
              </div>
              <div className="flex gap-2">
                {co.stage && (
                  <span style={BADGE}>{co.stage.replace(/_/g, " ")}</span>
                )}
                {co.outcome && (
                  <span style={BADGE_COPPER}>{co.outcome.replace(/_/g, " ")}</span>
                )}
              </div>
            </div>
          );
          return (
            <section className="mt-12 pt-8" style={{ borderTop: "1px solid var(--cr-rule)" }}>
              <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: "8px" }}>
                <div className="ruled-label">{t("investorProfile.portfolioCompanies")}</div>
                <span style={{ ...DATA, fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)" }}>{portfolio.length}</span>
              </div>
              <div>
                {portfolio.slice(0, 6).map(row)}
                {portfolio.length > 6 && (
                  <details data-cr-expander>
                    <summary
                      style={{
                        listStyle: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: "6px",
                        minHeight: "40px", padding: "8px 0",
                        borderTop: "1px solid var(--cr-rule)",
                        fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px",
                        color: "var(--cr-copper)",
                      }}
                    >
                      {tf("investorProfile.showAllPortfolio", `Show all ${portfolio.length} companies`, { count: portfolio.length })}
                    </summary>
                    {portfolio.slice(6).map((co, i) => row(co, i + 6))}
                  </details>
                )}
              </div>
            </section>
          );
        })()}

        {/* ── Similar investors ── */}
        {similar.length > 0 && (
          <section className="mt-12 pt-8" style={{ borderTop: "1px solid var(--cr-rule)" }}>
            <div className="ruled-label" style={{ marginBottom: "8px" }}>{t("investorProfile.similarInvestors")}</div>
            <div>
              {similar.map((s, i) => (
                <a key={s.slug} href={`/investors/${s.slug}`}
                  className="group flex items-center justify-between gap-4 hover:bg-cr-p3 transition-colors -mx-2 px-2"
                  style={{ padding: "12px 8px", borderTop: i > 0 ? "1px solid var(--cr-rule)" : "none", textDecoration: "none", minHeight: "48px", borderRadius: "4px" }}>
                  <div className="min-w-0">
                    <p className="truncate text-cr-ink group-hover:text-cr-copper transition-colors" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px" }}>
                      {s.display_name || s.firm_name || s.slug}
                    </p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px" }}>
                      {typeLabel(s.type)}{s.firm_name && s.display_name ? ` · ${s.firm_name}` : ""}
                    </p>
                  </div>
                  {(s.industries ?? []).length > 0 && (
                    <p className="truncate hidden sm:block text-right" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-3)", maxWidth: "40%" }}>
                      {(s.industries ?? []).slice(0, 3).join(", ")}
                    </p>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ── CTA ───────────────────────────────────────────────────────────
            Only shown to signed-out visitors. It previously invited everyone to
            sign up as a startup, including the investor viewing their own page
            and founders who already have a listing. */}
        {!user && (
          <div className="mt-12 pt-8 flex flex-col items-center text-center" style={{ borderTop: "1px solid var(--cr-rule)" }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", lineHeight: 1.65, color: "var(--cr-ink-3)", maxWidth: "44ch", marginBottom: "16px" }}>
              {t("investorProfile.founderCta", { name: displayName })}
            </p>
            <a href="/auth/signup?role=startup"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--cr-copper)", color: "white", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", padding: "12px 24px", borderRadius: "999px", textDecoration: "none" }}>
              {t("investors.listYourStartup")} →
            </a>
          </div>
        )}
        {/* Unconditional, and deliberately not folded into the record chip
            above: that chip renders nothing when nothing is on file, which is
            right for a claim and wrong for a review. This section says the
            absence out loud. */}
        <section className="mt-12 pt-8" style={{ borderTop: "1px solid var(--cr-rule)" }}>
          <WhatWeChecked subjectType="investor" subjectId={investor.id} />
        </section>

        <JsonLdScript data={investorJsonLd({
          slug: investor.slug,
          displayName: investor.display_name ?? null,
          firmName: investor.firm_name ?? null,
          bio: investor.bio ?? null,
          type: investor.type ?? null,
          website: (investor as { website?: string | null }).website ?? null,
        })} />
        <JsonLdScript data={breadcrumbJsonLd([
          { name: "Investors", path: "/investors" },
          { name: investor.firm_name || investor.display_name || investor.slug, path: `/investors/${investor.slug}` },
        ])} />

        {/* E50: a signed-in visitor can say this profile is not what it
            claims. Signed-out visitors cannot — a report needs someone to
            come back to. */}
        {user && (
          <div className="mt-12" style={{ borderTop: "1px solid var(--cr-rule)", paddingTop: "16px" }}>
            <ReportButton targetType="investor" targetId={investor.id} />
          </div>
        )}
      </main>
      </TranslatedContent>
      <Footer />
    </>
  );
}
