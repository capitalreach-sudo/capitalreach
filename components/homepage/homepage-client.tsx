"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReveal } from "@/hooks/useReveal";
import { useCountUp } from "@/hooks/useCountUp";
import { useTranslation } from "@/hooks/useTranslation";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { WordReveal }  from "@/components/ui/WordReveal";
import { StatsTicker } from "@/components/ui/StatsTicker";
import { FeeCounter }  from "@/components/ui/FeeCounter";
import { HeroParticles } from "@/components/ui/HeroParticles";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { formatCurrency, formatGrowth } from "@/lib/format";
import { FOUNDER_PLANS_LIST, INVESTOR_PLANS_LIST } from "@/lib/plans";
import type { PlatformStats } from "@/lib/stats";
import type { HeroStartup, ListingSnippet } from "@/app/page";

// ── Primitives ────────────────────────────────────────────────

function DiamondDot() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 0L6 3L3 6L0 3L3 0Z" fill="#B5651D" />
    </svg>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span style={{
      background: "#EDE8DE", border: "1px solid #D8D0C4", borderRadius: "3px",
      padding: "3px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
      fontSize: "11px", color: "#6B6056", textTransform: "uppercase", letterSpacing: "0.06em",
      whiteSpace: "nowrap",
    }}>
      {stage}
    </span>
  );
}

// ── Hero Card ────────────────────────────────────────────────

function HeroCard({ startup }: { startup: HeroStartup }) {
  const { t } = useTranslation();

  const metrics = [
    { label: t("startupDetail.mrr"),    value: startup.mrr        != null ? formatCurrency(startup.mrr)           : "—" },
    { label: t("startupDetail.arr"),    value: startup.arr        != null ? formatCurrency(startup.arr)           : "—" },
    { label: t("startupDetail.growth"), value: startup.growth_mom != null ? formatGrowth(startup.growth_mom).text : "—" },
    { label: t("startupDetail.runway"), value: startup.runway     != null ? `${startup.runway}mo`                 : "—" },
  ];

  return (
    <div style={{ width: "100%", border: "1px solid #D8D0C4", borderRadius: "6px", overflow: "hidden", background: "#EDE8DE" }}>

      {/* Top strip */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px", background: "#EDE8DE",
        borderBottom: "1px solid #D8D0C4",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "4px", background: "#E4DDD2",
            border: "1px solid #D8D0C4", display: "flex", alignItems: "center",
            justifyContent: "center", overflow: "hidden", flexShrink: 0,
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "16px", color: "#B5651D",
          }}>
            {startup.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={startup.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : startup.name.charAt(0)
            }
          </div>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "#1A1612" }}>{startup.name}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "#9C8E82", marginTop: "2px" }}>{startup.industry}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
          <ScoreRing score={startup.vaultrise_score} size={52} strokeWidth={4} />
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "9px", fontWeight: 500, color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("listings.aiScore")}
          </div>
        </div>
      </div>

      {/* Metrics area */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "#D8D0C4" }}>
        {metrics.map(({ label, value }) => (
          <div key={label} style={{ padding: "12px 14px", background: "#F5F0E8" }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>{label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "20px", color: "#1A1612", lineHeight: 1.1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Bottom strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "#E4DDD2", borderTop: "1px solid #D8D0C4" }}>
        <div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>{t("listings.raising")}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "20px", color: "#B5651D", lineHeight: 1.1 }}>{formatCurrency(startup.funding_target)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
          <StageBadge stage={startup.stage} />
          {/* 2% badge */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            background: "rgba(181,101,29,0.12)", border: "1px solid rgba(181,101,29,0.3)",
            borderRadius: "3px", padding: "3px 7px",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
            fontSize: "10px", color: "#B5651D", letterSpacing: "0.04em",
          }}>
            ◆ 2% at close only
          </span>
          <Link href={`/startups/${startup.slug}`}
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "#B5651D", textDecoration: "none" }}>
            {t("common.viewDeal")} →
          </Link>
        </div>
      </div>
    </div>
  );
}

function HeroCardPlaceholder() {
  const { t } = useTranslation();
  return (
    <div style={{ width: "100%", background: "#EDE8DE", border: "1px solid #D8D0C4", borderRadius: "6px", padding: "60px 40px", textAlign: "center" }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "#9C8E82", lineHeight: 1.7 }}>
        {t("hero.beFirst")}<br />
        <Link href="/auth/signup?role=startup" style={{ color: "#B5651D", textDecoration: "none" }}>{t("hero.applyToList")} →</Link>
      </p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

interface Props {
  stats:       PlatformStats;
  heroStartup: HeroStartup | null;
  listings:    ListingSnippet[];
}

export function HomepageClient({ stats, heroStartup, listings }: Props) {
  const { t } = useTranslation();
  const [pricingTab, setPricingTab] = useState<"founder" | "investor">("founder");
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const router = useRouter();

  // Count-up hooks
  const suCU = useCountUp(stats.startupCount,     1200);
  const iuCU = useCountUp(stats.investorCount,    1200);
  const duCU = useCountUp(stats.dealsClosedCount, 1200);
  const ruCU = useCountUp(stats.totalRaised,      1200);

  // Reveal hooks
  const listRef = useReveal();
  const howRef  = useReveal();
  const aiRef   = useReveal();

  // Translated data arrays
  const FOUNDER_STEPS_T: [string, string, string][] = [
    ["01", t("howItWorks.f1title"), t("howItWorks.f1desc")],
    ["02", t("howItWorks.f2title"), t("howItWorks.f2desc")],
    ["03", t("howItWorks.f3title"), t("howItWorks.f3desc")],
    ["04", t("howItWorks.f4title"), t("howItWorks.f4desc")],
  ];

  const INVESTOR_STEPS_T: [string, string, string][] = [
    ["01", t("howItWorks.i1title"), t("howItWorks.i1desc")],
    ["02", t("howItWorks.i2title"), t("howItWorks.i2desc")],
    ["03", t("howItWorks.i3title"), t("howItWorks.i3desc")],
    ["04", t("howItWorks.i4title"), t("howItWorks.i4desc")],
  ];

  const AI_TOOLS_T = [
    { num: "01", name: t("aiSection.t1title"), href: "/ai#score",        desc: t("aiSection.t1desc"), cta: t("aiSection.t1cta") },
    { num: "02", name: t("aiSection.t2title"), href: "/ai#match",         desc: t("aiSection.t2desc"), cta: t("aiSection.t2cta") },
    { num: "03", name: t("aiSection.t3title"), href: "/ai#due-diligence", desc: t("aiSection.t3desc"), cta: t("aiSection.t3cta") },
  ] as const;

  const FOUNDER_FEATURES_T = [
    { feature: t("pricing.feature_listings"),  values: ["1", "1", t("common.unlimited")]   as [string,string,string] },
    { feature: t("pricing.feature_aiScore"),   values: ["—", "✓", "✓"]                     as [string,string,string] },
    { feature: t("pricing.feature_nda"),       values: ["—", "✓", "✓"]                     as [string,string,string] },
    { feature: t("pricing.feature_pipeline"),  values: ["—", "✓", "✓"]                     as [string,string,string] },
    { feature: t("pricing.feature_analytics"), values: ["—", "—", "✓"]                     as [string,string,string] },
    { feature: t("pricing.feature_featured"),  values: ["—", "—", "✓"]                     as [string,string,string] },
    { feature: t("pricing.feature_priority"),  values: ["—", "✓", "✓"]                     as [string,string,string] },
  ];

  const INVESTOR_FEATURES_T = [
    { feature: t("pricing.feature_investorBrowse"),     values: ["✓", "✓",          "✓"]                     as [string,string,string] },
    { feature: t("pricing.feature_investorFinancials"), values: ["—", "✓",          "✓"]                     as [string,string,string] },
    { feature: t("pricing.feature_investorMessaging"),  values: ["—", "✓",          "✓"]                     as [string,string,string] },
    { feature: t("pricing.feature_investorDiligence"),  values: ["—", "$29/report", t("common.included")]    as [string,string,string] },
    { feature: t("pricing.feature_investorMatching"),   values: ["—", "—",          "✓"]                     as [string,string,string] },
    { feature: t("pricing.feature_investorExport"),     values: ["—", "—",          "✓"]                     as [string,string,string] },
  ];

  // Stats — filter zeros
  const statsItems = [
    { label: t("stats.startupsListed"),    raw: stats.startupCount,     ref: suCU.ref, display: suCU.value.toLocaleString() },
    { label: t("stats.verifiedInvestors"), raw: stats.investorCount,    ref: iuCU.ref, display: iuCU.value.toLocaleString() },
    { label: t("stats.dealsClosed"),       raw: stats.dealsClosedCount, ref: duCU.ref, display: duCU.value.toLocaleString() },
    { label: t("stats.capitalRaised"),     raw: stats.totalRaised,      ref: ruCU.ref, display: formatCurrency(ruCU.value) },
  ].filter(s => s.raw > 0);
  const showStats = statsItems.length > 0;

  // Trust indicators
  const trustItems: [number, string][] = [
    [stats.startupCount,     t("trustIndicators.startupsListed")],
    [stats.investorCount,    t("trustIndicators.verifiedInvestors")],
    [stats.dealsClosedCount, t("trustIndicators.dealsClosed")],
  ];

  // Pricing
  const isFounder       = pricingTab === "founder";
  const pricingPlans    = isFounder ? FOUNDER_PLANS_LIST.slice(0, 3) : INVESTOR_PLANS_LIST.slice(0, 3);
  const pricingFeatures = isFounder ? FOUNDER_FEATURES_T : INVESTOR_FEATURES_T;

  return (
    <main style={{ background: "#F5F0E8" }}>

      {/* ── HERO ── */}
      <section
        style={{ background: "#F5F0E8", position: "relative", overflow: "hidden" }}
        className="min-h-[calc(100svh-56px)] flex items-center"
      >
        {/* Copper noise texture overlay */}
        <div className="hero-noise" />

        {/* Copper dot particle trail on mouse move */}
        <HeroParticles />

        {/* Ambient orbs */}
        <div className="hero-orb" style={{ width: 600, height: 600, top: "-200px", left: "-200px" }} />
        <div className="hero-orb" style={{ width: 400, height: 400, bottom: "-100px", right: "-100px", animationDelay: "-6s" }} />

        <div
          className="max-w-[1200px] mx-auto w-full px-6 md:px-10 grid grid-cols-1 md:grid-cols-[55fr_45fr] gap-10 md:gap-16 py-16 md:py-0"
          style={{ position: "relative", zIndex: 1 }}
        >
          {/* Left column */}
          <div className="flex flex-col justify-center">
            <div className="ruled-label" style={{ marginBottom: "40px" }}>{t("hero.eyebrow")}</div>

            <h1 style={{
              fontFamily:    "'Playfair Display', Georgia, serif",
              fontWeight:    700,
              fontStyle:     "italic",
              fontSize:      "clamp(36px, 8vw, 72px)",
              color:         "#1A1612",
              lineHeight:    0.95,
              letterSpacing: "-0.02em",
              marginBottom:  "24px",
            }}>
              <span style={{ display: "block" }}>
                <WordReveal text={t("hero.headline1")} delay={60} threshold={0.05} />
              </span>
              <span style={{ display: "block" }}>
                <WordReveal text={t("hero.headline2")} delay={60} threshold={0.05} />
              </span>
              <span style={{ display: "block" }}>
                <WordReveal text={t("hero.headline3")} delay={60} threshold={0.05} className="copper-foil" />
              </span>
            </h1>

            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize:   "17px",
              color:      "#6B6056",
              lineHeight: 1.7,
              maxWidth:   "420px",
            }}>
              {t("hero.sub")}
            </p>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
              fontSize: "13px", color: "#9C8E82", lineHeight: 1.5,
              marginTop: "12px", maxWidth: "420px",
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              <span style={{ color: "#B5651D", fontSize: "10px" }}>◆</span>
              <span>
                <strong style={{ fontWeight: 600, color: "#B5651D" }}>{t("hero.feeNoteLabel")}</strong>
                {" — "}{t("hero.feeNoteSuffix")}
              </span>
            </p>

            {/* CTAs */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "40px", flexWrap: "wrap" }}>
              <Link href="/auth/signup?role=startup" style={{ textDecoration: "none" }}>
                <MagneticButton
                  className="btn-copper-shimmer"
                  style={{ background: "#B5651D", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", padding: "13px 28px", borderRadius: "4px", border: "none", cursor: "pointer" }}
                >
                  {t("hero.ctaPrimary")}
                </MagneticButton>
              </Link>
              <Link href="/startups" style={{ textDecoration: "none" }}>
                <MagneticButton
                  style={{ background: "transparent", color: "#1A1612", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "15px", padding: "12px 28px", borderRadius: "4px", border: "1px solid #D8D0C4", cursor: "pointer" }}
                >
                  {t("hero.ctaSecondary")} →
                </MagneticButton>
              </Link>
            </div>

            {/* Trust indicators */}
            {trustItems.some(([v]) => v > 0) && (
              <div style={{ display: "flex", alignItems: "center", gap: "24px", marginTop: "32px", flexWrap: "wrap" }}>
                {trustItems.filter(([v]) => v > 0).map(([v, label]) => (
                  <div key={label} style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                    <DiamondDot />
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#6B6056" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: "#3D3630" }}>{v.toLocaleString()}</span>{" "}{label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="flex items-center mt-10 md:mt-0">
            {heroStartup ? <HeroCard startup={heroStartup} /> : <HeroCardPlaceholder />}
          </div>
        </div>
      </section>

      {/* ── SCROLLING TICKER TAPE ── */}
      <StatsTicker
        items={[
          { value: stats.startupCount > 0 ? stats.startupCount.toLocaleString() : "—", label: t("stats.startupsListed") },
          { value: "2%",                                                                 label: t("feeStrip.tagline")     },
          { value: stats.investorCount > 0 ? stats.investorCount.toLocaleString() : "—", label: t("stats.verifiedInvestors") },
          { value: "0",                                                                  label: "upfront fees"            },
          { value: stats.dealsClosedCount > 0 ? stats.dealsClosedCount.toLocaleString() : "—", label: t("stats.dealsClosed") },
          { value: "100%",                                                               label: "vetted listings"         },
        ]}
        speed={36}
      />

      {/* ── STATS STRIP ── */}
      {showStats && (
        <div
          className="h-[72px] flex items-center"
          style={{ background: "#EDE8DE", borderTop: "1px solid rgba(26,22,18,0.1)", borderBottom: "1px solid rgba(26,22,18,0.1)" }}
        >
          <div className="max-w-[1200px] mx-auto w-full h-full px-6 md:px-10">
            <div
              className="grid h-full"
              style={{ gridTemplateColumns: `repeat(${statsItems.length}, 1fr)` }}
            >
              {statsItems.map((item, i) => {
                const isLast = i === statsItems.length - 1;
                return (
                  <div
                    key={item.label}
                    ref={item.ref as React.RefObject<HTMLDivElement>}
                    className="flex flex-col justify-center items-center"
                    style={{ borderRight: !isLast ? "1px solid rgba(26,22,18,0.1)" : undefined }}
                  >
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "28px", color: "#1A1612", lineHeight: 1 }}>
                      {item.display}
                    </div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "4px" }}>
                      {item.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── LISTINGS TABLE ── */}
      <section
        ref={listRef as React.RefObject<HTMLElement>}
        className="reveal"
        style={{ background: "#F5F0E8", borderBottom: "1px solid rgba(26,22,18,0.1)" }}
      >
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-20">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
            <div className="ruled-label">{t("listings.title")}</div>
            <Link href="/startups" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "#B5651D", textDecoration: "none" }}>{t("listings.viewAll")} →</Link>
          </div>

          {/* Desktop header */}
          <div className="hidden md:flex items-center" style={{ paddingBottom: "12px", borderBottom: "1px solid rgba(26,22,18,0.2)" }}>
            <div style={{ minWidth: "28px" }} />
            <div style={{ flex: 1, minWidth: "180px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("listings.company")}</div>
            <div style={{ minWidth: "120px", maxWidth: "120px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("listings.industry")}</div>
            <div style={{ minWidth: "100px", maxWidth: "100px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("listings.stage")}</div>
            <div style={{ minWidth: "90px", textAlign: "right", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("listings.mrr")}</div>
            <div style={{ minWidth: "100px", textAlign: "right", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("listings.raising")}</div>
            <div style={{ minWidth: "64px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("listings.score")}</div>
            <div style={{ minWidth: "48px", textAlign: "right" }} />
          </div>

          {/* Mobile header */}
          <div className="flex md:hidden items-center" style={{ paddingBottom: "12px", borderBottom: "1px solid rgba(26,22,18,0.2)" }}>
            <div style={{ flex: 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("listings.company")}</div>
            <div style={{ minWidth: "80px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("listings.stage")}</div>
            <div style={{ minWidth: "90px", textAlign: "right", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("listings.raising")}</div>
            <div style={{ minWidth: "36px" }} />
          </div>

          {listings.length === 0 ? (
            <div style={{ paddingTop: "32px", textAlign: "center" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "#9C8E82", marginBottom: "16px" }}>
                {t("listings.noListings")}
              </p>
              <Link href="/auth/signup?role=startup">
                <button
                  className="btn-copper-shimmer"
                  style={{ background: "#B5651D", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", padding: "10px 20px", borderRadius: "4px", border: "none", cursor: "pointer" }}
                >
                  {t("listings.listNow")} →
                </button>
              </Link>
            </div>
          ) : (
            listings.map((s, rowIdx) => {
              const isHovered = hoveredRow === s.id;
              return (
                <div
                  key={s.id}
                  className="listing-row reveal-child flex items-center h-[56px]"
                  onClick={() => router.push(`/startups/${s.slug}`)}
                  onMouseEnter={() => setHoveredRow(s.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    borderBottom: "1px solid rgba(26,22,18,0.08)",
                    background: isHovered ? "#E4DDD2" : "transparent",
                    transition: "background 120ms ease",
                    cursor: "pointer",
                  }}
                >
                  {/* Row number */}
                  <span className="listing-row-num hidden md:inline-block" style={{ minWidth: "28px", paddingLeft: "4px" }}>
                    {String(rowIdx + 1).padStart(2, "0")}
                  </span>

                  {/* Logo + Name */}
                  <div style={{ flex: 1, minWidth: "180px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", background: "#E4DDD2",
                      border: "1px solid #D8D0C4", display: "flex", alignItems: "center",
                      justifyContent: "center", overflow: "hidden", flexShrink: 0,
                      fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "#B5651D",
                    }}>
                      {s.logo_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={s.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : s.name.charAt(0)
                      }
                    </div>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#1A1612" }}>{s.name}</span>
                  </div>

                  {/* Industry — desktop only */}
                  <div
                    className="hidden md:block"
                    style={{ minWidth: "120px", maxWidth: "120px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#6B6056", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {s.industry}
                  </div>

                  {/* Stage */}
                  <div style={{ minWidth: "100px", maxWidth: "100px" }}><StageBadge stage={s.stage} /></div>

                  {/* MRR — desktop only */}
                  <div
                    className="hidden md:block"
                    style={{ minWidth: "90px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px", color: "#3D3630" }}
                  >
                    {s.mrr != null ? formatCurrency(s.mrr) : "—"}
                  </div>

                  {/* Raising */}
                  <div style={{ minWidth: "100px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "#B5651D" }}>
                    {formatCurrency(s.funding_target)}
                  </div>

                  {/* AI Score — desktop only */}
                  <div className="hidden md:flex justify-center" style={{ minWidth: "64px" }}>
                    <ScoreRing score={s.vaultrise_score} size={36} strokeWidth={3} />
                  </div>

                  {/* View arrow */}
                  <div style={{ minWidth: "48px", textAlign: "right" }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: isHovered ? "#1A1612" : "#9C8E82", transition: "color 120ms ease" }}>
                      {t("listings.view")} →
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ── 2% FEE STRIP ── */}
      <div style={{
        background: "#1A1612", padding: "32px 0", position: "relative", overflow: "hidden",
      }}>
        {/* Animated copper draw-line — class defined in globals.css */}
        <div className="fee-strip-line" />
        <div className="max-w-[1200px] mx-auto px-6 md:px-10">
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "40px", flexWrap: "wrap",
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
              fontSize: "clamp(36px,5vw,56px)",
              lineHeight: 1, letterSpacing: "-0.04em", flexShrink: 0,
            }}>
              <FeeCounter from={10} to={2} className="copper-foil" duration={1600} />
            </span>
            <div style={{ maxWidth: "440px" }}>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                fontSize: "16px", color: "#F5F0E8", marginBottom: "6px",
              }}>
                {t("feeStrip.stripTitle")}
              </p>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontWeight: 300,
                fontSize: "13px", color: "#9C8E82", lineHeight: 1.6,
              }}>
                {t("feeStrip.stripBody").split("{zero}")[0]}
                <strong style={{ fontWeight: 600, color: "#B5651D" }}>{t("feeStrip.zero")}</strong>
                {t("feeStrip.stripBody").split("{zero}")[1]}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
              {[t("feeStrip.bullet1"), t("feeStrip.bullet2"), t("feeStrip.bullet3")].map(item => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#B5651D", fontSize: "10px" }}>◆</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "#9C8E82" }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <section
        ref={howRef as React.RefObject<HTMLElement>}
        className="reveal"
        style={{ background: "#EDE8DE", borderBottom: "1px solid rgba(26,22,18,0.1)" }}
      >
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-20">
          <div className="ruled-label" style={{ marginBottom: "48px" }}>{t("howItWorks.sectionLabel")}</div>

          <div className="flex flex-col md:flex-row">
            {/* Founders column */}
            <div className="flex-1 md:pr-12 md:border-r pb-10 md:pb-0" style={{ borderColor: "rgba(26,22,18,0.12)" }}>
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "#1A1612", marginBottom: "32px" }}>{t("howItWorks.founders")}</h3>
              {FOUNDER_STEPS_T.map(([num, title, desc], i) => (
                <div
                  key={num}
                  className="reveal-child"
                  style={{
                    display: "flex", alignItems: "flex-start", gap: "16px",
                    marginBottom: i < FOUNDER_STEPS_T.length - 1 ? "28px" : 0,
                  }}
                >
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "#9C8E82", minWidth: "24px", flexShrink: 0, lineHeight: "1.4" }}>{num}</div>
                  <div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "15px", color: "#1A1612", marginBottom: "4px" }}>{title}</div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#6B6056", lineHeight: 1.55 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Investors column */}
            <div className="flex-1 md:pl-12 pt-10 md:pt-0" style={{ borderTop: "1px solid rgba(26,22,18,0.12)" }}>
              <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "#1A1612", marginBottom: "32px", marginTop: "0" }}>{t("howItWorks.investors")}</h3>
              {INVESTOR_STEPS_T.map(([num, title, desc], i) => (
                <div
                  key={num}
                  className="reveal-child"
                  style={{
                    display: "flex", alignItems: "flex-start", gap: "16px",
                    marginBottom: i < INVESTOR_STEPS_T.length - 1 ? "28px" : 0,
                  }}
                >
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "#9C8E82", minWidth: "24px", flexShrink: 0, lineHeight: "1.4" }}>{num}</div>
                  <div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "15px", color: "#1A1612", marginBottom: "4px" }}>{title}</div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#6B6056", lineHeight: 1.55 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── AI TOOLS ── */}
      <section
        ref={aiRef as React.RefObject<HTMLElement>}
        className="reveal"
        style={{ background: "#F5F0E8", borderBottom: "1px solid rgba(26,22,18,0.1)" }}
      >
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-20">
          <div className="ruled-label" style={{ marginBottom: "48px" }}>{t("aiSection.sectionLabel")}</div>

          <div className="flex flex-col md:flex-row">
            {AI_TOOLS_T.map((tool, i) => (
              <div
                key={tool.name}
                className={[
                  "flex-1 reveal-child",
                  i < 2 ? "md:border-r md:pr-10" : "md:pl-10",
                  i === 1 ? "md:px-10" : "",
                  i < 2 ? "pb-10 md:pb-0 border-b md:border-b-0" : "",
                ].join(" ")}
                style={{ borderColor: "rgba(26,22,18,0.12)" }}
              >
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, fontSize: "11px", color: "#9C8E82", marginBottom: "16px" }}>{tool.num}</div>
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: "22px", color: "#1A1612", lineHeight: 1.1, marginBottom: "12px" }}>{tool.name}</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "#6B6056", lineHeight: 1.65, marginBottom: "24px" }}>{tool.desc}</p>
                <a
                  href={tool.href}
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "#B5651D", textDecoration: "none" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.textDecoration = "underline")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.textDecoration = "none")}
                >
                  {tool.cta} →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING TEASER ── */}
      <section style={{ background: "#EDE8DE", borderBottom: "1px solid rgba(26,22,18,0.1)" }}>
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-20">

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "48px", flexWrap: "wrap", gap: "16px" }}>
            <div className="ruled-label">{t("pricing.sectionLabel")}</div>
            {/* Toggle */}
            <div style={{ display: "flex", borderBottom: "2px solid rgba(26,22,18,0.1)" }}>
              {(["founder", "investor"] as const).map((tab) => {
                const active = pricingTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setPricingTab(tab)}
                    style={{
                      background:   "transparent",
                      border:       "none",
                      borderBottom: active ? "2px solid #B5651D" : "2px solid transparent",
                      marginBottom: "-2px",
                      cursor:       "pointer",
                      padding:      "0 24px 12px 0",
                      fontFamily:   "'DM Sans', sans-serif",
                      fontWeight:   500,
                      fontSize:     "14px",
                      color:        active ? "#1A1612" : "#9C8E82",
                      transition:   "color 150ms ease",
                    }}
                  >
                    {tab === "founder" ? t("pricing.founders") : t("pricing.investors")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block" style={{ border: "1px solid rgba(26,22,18,0.15)", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ minWidth: "200px" }} />
                {pricingPlans.map((_, i) => <col key={i} />)}
              </colgroup>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(26,22,18,0.2)" }}>
                  <th style={{ padding: "16px 20px 12px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "#9C8E82", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("pricing.feature")}</th>
                  {pricingPlans.map((plan, i) => {
                    const featured = i === 1;
                    return (
                      <th key={plan.id} style={{
                        padding: "16px 20px 12px", textAlign: "center",
                        background: featured ? "rgba(181,101,29,0.05)" : "transparent",
                        borderLeft: featured ? "1px solid rgba(181,101,29,0.2)" : "1px solid rgba(26,22,18,0.1)",
                        borderRight: featured ? "1px solid rgba(181,101,29,0.2)" : "none",
                      }}>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: featured ? "#B5651D" : "#1A1612" }}>{plan.name}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "22px", color: featured ? "#B5651D" : "#1A1612", marginTop: "4px", lineHeight: 1 }}>
                          {plan.price === 0
                            ? t("pricing.free")
                            : <>{`$${plan.price}`}<span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#9C8E82" }}>{t("pricing.perMonth")}</span></>
                          }
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pricingFeatures.map(({ feature, values }, rowIdx) => (
                  <tr key={feature} style={{ background: rowIdx % 2 === 0 ? "rgba(26,22,18,0.03)" : "transparent", borderBottom: "1px solid rgba(26,22,18,0.08)" }}>
                    <td style={{ padding: "11px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "14px", color: "#1A1612" }}>{feature}</td>
                    {values.map((v, i) => {
                      const isCheck = v === "✓";
                      const isDash  = v === "—";
                      const featured = i === 1;
                      return (
                        <td key={i} style={{
                          padding: "11px 20px", textAlign: "center",
                          fontFamily: isCheck || isDash ? "'DM Sans', sans-serif" : "'JetBrains Mono', monospace",
                          fontWeight: isCheck ? 500 : isDash ? 300 : 500,
                          fontSize: "14px",
                          color: isCheck ? "#2D6A4F" : isDash ? "#9C8E82" : "#3D3630",
                          background: featured ? "rgba(181,101,29,0.05)" : "transparent",
                          borderLeft: featured ? "1px solid rgba(181,101,29,0.2)" : "1px solid rgba(26,22,18,0.08)",
                          borderRight: featured ? "1px solid rgba(181,101,29,0.2)" : "none",
                        }}>
                          {v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: "16px 20px" }} />
                  {pricingPlans.map((plan, i) => {
                    const featured = i === 1;
                    return (
                      <td key={plan.id} style={{
                        padding: "16px 20px", textAlign: "center",
                        background: featured ? "rgba(181,101,29,0.05)" : "transparent",
                        borderLeft: featured ? "1px solid rgba(181,101,29,0.2)" : "1px solid rgba(26,22,18,0.08)",
                        borderRight: featured ? "1px solid rgba(181,101,29,0.2)" : "none",
                      }}>
                        <Link href={`/pricing#${isFounder ? "founders" : "investors"}`} style={{ textDecoration: "none" }}>
                          <button
                            className={featured ? "btn-copper-shimmer" : ""}
                            style={{
                              background: featured ? "#B5651D" : "transparent",
                              color: featured ? "#fff" : "#6B6056",
                              fontFamily: "'DM Sans', sans-serif",
                              fontWeight: featured ? 600 : 400,
                              fontSize: "13px", padding: "9px 20px", borderRadius: "4px",
                              border: featured ? "none" : "1px solid #D8D0C4",
                              cursor: "pointer", width: "100%",
                            }}
                          >
                            {plan.price === 0 ? t("pricing.getStartedFree") : t("pricing.getStarted")}
                          </button>
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-4">
            {pricingPlans.map((plan, i) => {
              const featured = i === 1;
              return (
                <div key={plan.id} style={{
                  background: "#F5F0E8",
                  border: `1px solid ${featured ? "rgba(181,101,29,0.4)" : "#D8D0C4"}`,
                  borderRadius: "6px", padding: "20px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "16px", color: "#1A1612" }}>{plan.name}</div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "22px", color: featured ? "#B5651D" : "#1A1612", marginTop: "4px", lineHeight: 1 }}>
                        {plan.price === 0 ? t("pricing.free") : `$${plan.price}`}
                        {plan.price > 0 && <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "#9C8E82" }}>{t("pricing.perMonth")}</span>}
                      </div>
                    </div>
                    {featured && <span style={{ background: "#B5651D", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", padding: "3px 8px", borderRadius: "3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("pricing.popular")}</span>}
                  </div>
                  {pricingFeatures.map(({ feature, values }) => {
                    const v = values[i];
                    const isCheck = v === "✓";
                    const isDash  = v === "—";
                    return (
                      <div key={feature} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(26,22,18,0.06)" }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "#1A1612" }}>{feature}</span>
                        <span style={{ fontFamily: isCheck || isDash ? "'DM Sans', sans-serif" : "'JetBrains Mono', monospace", fontWeight: isCheck ? 500 : 300, fontSize: "13px", color: isCheck ? "#2D6A4F" : isDash ? "#9C8E82" : "#3D3630" }}>{v}</span>
                      </div>
                    );
                  })}
                  <Link href="/pricing" style={{ textDecoration: "none", display: "block", marginTop: "16px" }}>
                    <button
                      className={featured ? "btn-copper-shimmer" : ""}
                      style={{ width: "100%", height: "40px", background: featured ? "#B5651D" : "transparent", color: featured ? "#fff" : "#6B6056", fontFamily: "'DM Sans', sans-serif", fontWeight: featured ? 600 : 400, fontSize: "13px", borderRadius: "4px", border: featured ? "none" : "1px solid #D8D0C4", cursor: "pointer" }}
                    >
                      {plan.price === 0 ? t("pricing.getStartedFree") : t("pricing.getStarted")}
                    </button>
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Below-table actions */}
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "32px", flexWrap: "wrap" }}>
            <Link href="/pricing" style={{ textDecoration: "none" }}>
              <button style={{ height: "40px", padding: "0 20px", background: "transparent", color: "#6B6056", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", borderRadius: "4px", border: "1px solid #D8D0C4", cursor: "pointer" }}>
                {t("pricing.seeFull")}
              </button>
            </Link>
            <Link href="/auth/signup" style={{ textDecoration: "none" }}>
              <button
                className="btn-copper-shimmer"
                style={{ height: "40px", padding: "0 20px", background: "#B5651D", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", borderRadius: "4px", border: "none", cursor: "pointer" }}
              >
                {t("pricing.getStarted")}
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ background: "#F5F0E8" }}>
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-20 text-center">
          <div style={{ maxWidth: "640px", margin: "0 auto" }}>
            <div className="ruled-label" style={{ justifyContent: "center", marginBottom: "32px" }}>{t("cta.label")}</div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(32px, 4vw, 52px)", color: "#1A1612", lineHeight: 1.08, letterSpacing: "-0.02em", marginBottom: "24px" }}>
              {t("cta.headline1")}<br />
              {t("cta.headline2")}
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "16px", color: "#6B6056", lineHeight: 1.7, marginBottom: "40px" }}>
              {t("cta.sub")}
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
              <Link href="/auth/signup?role=startup" style={{ textDecoration: "none" }}>
                <MagneticButton
                  className="btn-copper-shimmer"
                  style={{ background: "#B5651D", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", padding: "13px 32px", borderRadius: "4px", border: "none", cursor: "pointer" }}
                >
                  {t("cta.listStartup")}
                </MagneticButton>
              </Link>
              <Link href="/auth/signup?role=investor" style={{ textDecoration: "none" }}>
                <MagneticButton
                  style={{ background: "transparent", color: "#1A1612", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "15px", padding: "12px 32px", borderRadius: "4px", border: "1px solid #D8D0C4", cursor: "pointer" }}
                >
                  {t("cta.exploreInvestor")} →
                </MagneticButton>
              </Link>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
