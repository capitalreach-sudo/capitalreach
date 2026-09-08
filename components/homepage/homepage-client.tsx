"use client";

import { useState } from "react";
import { CountUp } from "@/components/ui/count-up";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReveal } from "@/hooks/useReveal";
import { useTranslation } from "@/hooks/useTranslation";
import { ScoreBadge } from "@/components/ui/score-badge";
import { ScrollProgress } from "@/components/ui/ScrollProgress";
import { ActivityPulse } from "@/components/homepage/activity-pulse";
import { WaxSeal } from "@/components/ui/WaxSeal";
import { MarketMatcher } from "@/components/homepage/market-matcher";
import { safeFormatCurrency } from "@/lib/format";
import type { PlatformStats } from "@/lib/stats";
import type { LaunchStatus } from "@/lib/launchMode";
import type { ListingSnippet, TickerSnippet } from "@/app/page";

// ── Primitives ────────────────────────────────────────────────

function DiamondDot() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" fill="none" style={{ flexShrink: 0 }} aria-hidden>
      <path d="M3 0L6 3L3 6L0 3L3 0Z" fill="var(--cr-copper)" />
    </svg>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span style={{
      background: "var(--cr-paper-2)", border: "1px solid var(--cr-paper-4)", borderRadius: "3px",
      padding: "4px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
      fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em",
      whiteSpace: "nowrap",
    }}>
      {stage.replace(/_/g, " ")}
    </span>
  );
}

const TH: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px",
  color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em",
};

// ── Main Component ────────────────────────────────────────────

interface Props {
  stats:    PlatformStats;
  listings: ListingSnippet[];
  /** Every active round, light projection -- the ticker shows the whole market. */
  tickerListings?: TickerSnippet[];
  launch:   LaunchStatus;
}

/**
 * The page reads as ONE argument, top to bottom: what this is (hero) → what it
 * costs (proof strip) → how it works, founders or investors (tabbed steps) →
 * who is waiting for you (matcher) → the market moving (ticker, listings,
 * pulse) → the standard we hold (charter) → what to do next (closing CTA).
 *
 * Hierarchy rules this file. Exactly one element per view is the loudest: the
 * headline in the hero, the "2%" in the proof strip, the section head
 * elsewhere. Everything supporting steps down a size, a weight or a colour,
 * and copper marks only the single most important thing in each eyeful.
 *
 * Vertical rhythm, held everywhere: 96/64 between sections (py-16 md:py-24),
 * 32 between blocks inside a section, 12-16 inside a block, 8 between a label
 * and its value. Nothing off the 4/8/12/16/24/32/48/64/96 scale.
 *
 * The headline is plain CSS-animated text, so it can never render as
 * concatenated words. Every money figure goes through the safe formatters, so
 * a bad test value renders "—", never "$100000000B". Counts are shown only
 * when they are greater than zero -- "0 startups listed" is not a trust signal.
 */
export function HomepageClient({ stats, listings, tickerListings, launch, viewerRole = null, canSeeMarket = false }: Props & { viewerRole?: string | null; canSeeMarket?: boolean }) {
  const laneAll = (tickerListings && tickerListings.length ? tickerListings : listings);
  // The marquee renders the lane TWICE for the seamless loop, so DOM cost is
  // 2x lane length. 150 rounds is minutes of unrepeated tape; more is payload.
  const lane = laneAll.slice(0, 150);
  const { t } = useTranslation();
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  // How-it-works is two four-step journeys. Showing both at once was eight
  // cells of wall; the reader self-selects and the other track stays one tap
  // away -- nothing is gone, it is just not all shouting at the same time.
  const [track, setTrack] = useState(0);
  const router  = useRouter();
  const listRef = useReveal();

  // Pluralised per locale ("1 startup listed", "2 startups listed").
  const trustCounts: [number, string][] = [
    [stats.startupCount,     t("trustIndicators.startupsListed",    { count: stats.startupCount })],
    [stats.investorCount,    t("trustIndicators.verifiedInvestors", { count: stats.investorCount })],
    [stats.dealsClosedCount, t("trustIndicators.dealsClosed",       { count: stats.dealsClosedCount })],
  ].filter(([v]) => (v as number) > 0) as [number, string][];

  // value, label, needle position (percent along the gauge hairline)
  const proof: [string, string, number][] = [
    ["2%",   t("hero.proofFee"),      8],
    ["€0",   t("hero.proofUpfront"),  0],
    ["100%", t("hero.proofVetted"), 100],
  ];

  // Same sixteen strings the two-column bento used; all fifteen locales
  // already carry them, so the tabs cost nothing new to localise.
  const tracks = [
    { key: "founders",  label: t("howItWorks.forFounders"),  steps: [1, 2, 3, 4].map((n) => ({ title: t(`howItWorks.f${n}title`), desc: t(`howItWorks.f${n}desc`) })) },
    { key: "investors", label: t("howItWorks.forInvestors"), steps: [1, 2, 3, 4].map((n) => ({ title: t(`howItWorks.i${n}title`), desc: t(`howItWorks.i${n}desc`) })) },
  ];

  return (
    <main style={{ background: "var(--cr-paper)" }}>
      <ScrollProgress />

      {/* ── 1. HERO -- what this is ──────────────────────────── */}
      <section
        style={{ background: "var(--cr-paper)", position: "relative", overflow: "hidden" }}
        className="min-h-[calc(100svh-56px)] flex items-center"
        onMouseMove={(e) => {
          // The glow leans toward the cursor -- alive, never distracting.
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--glow-x", `${((e.clientX - r.left) / r.width) * 100}%`);
          e.currentTarget.style.setProperty("--glow-y", `${((e.clientY - r.top) / r.height) * 100}%`);
        }}
      >
        <div className="hero-glow" aria-hidden />
        <div className="hero-noise" aria-hidden />

        <div
          className="max-w-[1200px] mx-auto w-full px-6 md:px-10 py-16 md:py-0 grid lg:grid-cols-12 gap-12 lg:gap-16 items-center"
          style={{ position: "relative", zIndex: 1 }}
        >
        <div className="lg:col-span-7 flex flex-col items-center text-center lg:items-start lg:text-left">
          {launch.isLaunch ? (
            /* Quiet pill: it is a status, not the offer. The only copper in it
               is the diamond, so it cannot compete with the headline. */
            <Link
              href="/pricing"
              className="animate-fade-up"
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "32px",
                padding: "8px 16px", borderRadius: "999px", textDecoration: "none",
                background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-ink-3)",
                letterSpacing: "0.02em",
              }}
            >
              <span aria-hidden style={{ color: "var(--cr-copper)" }}>✦</span>
              {t("hero.launchPill", { count: launch.memberCount, target: launch.target })}
            </Link>
          ) : (
            <div className="ruled-label animate-fade-up" style={{ marginBottom: "32px" }}>
              {t("hero.eyebrow")}
            </div>
          )}

          {/* The one place WONK is allowed: the homepage's opening claim,
              revealed as ink bleeding into paper (pure CSS mask -- the text
              is always real DOM and cannot break). This is the single loudest
              element on the page; nothing else comes within 40px of it. */}
          <h1
            className="ink-bleed display-wonk"
            style={{
              fontFamily:    "var(--font-serif)",
              fontWeight:    700,
              fontStyle:     "italic",
              fontSize:      "clamp(38px, 6.6vw, 78px)",
              color:         "var(--cr-ink)",
              lineHeight:    1.02,
              textWrap:      "balance",
              letterSpacing: "-0.02em",
              marginBottom:  "24px",
            }}
          >
            {t("hero.headline1")}
            <br />
            {t("hero.headline2")}{" "}
            <span className="copper-foil">{t("hero.headline3")}</span>
          </h1>

          <p
            className="animate-fade-up-2"
            style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px",
              color: "var(--cr-ink-3)", lineHeight: 1.7, maxWidth: "520px",
            }}
          >
            {t("hero.oneLiner")}
          </p>

          {/* One primary action. Browse is a hairline pill, the demo is a text
              link -- three steps of loudness, not three buttons. */}
          <div
            className="animate-fade-up-3 flex flex-col sm:flex-row items-center justify-center w-full sm:w-auto"
            style={{ gap: "12px", marginTop: "32px" }}
          >
            <Link
              href={viewerRole === "startup" ? "/dashboard/startup" : viewerRole === "investor" ? "/dashboard/investor" : viewerRole === "admin" ? "/admin" : "/auth/signup?role=startup"}
              className="btn-copper-shimmer w-full sm:w-auto"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", padding: "12px 24px", borderRadius: "999px", border: "none", minHeight: "48px" }}
            >
              {viewerRole ? t("hero.ctaDashboard") : t("hero.ctaPrimary")}
            </Link>
            <Link
              href="/startups"
              className="w-full sm:w-auto"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "transparent", color: "var(--cr-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "15px", padding: "12px 24px", borderRadius: "999px", border: "1px solid var(--cr-paper-4)", minHeight: "48px" }}
            >
              {t("hero.ctaSecondary")} →
            </Link>
          </div>

          {!viewerRole && (
            <Link href="/demo" className="animate-fade-up-3" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-4)", textDecoration: "underline", textUnderlineOffset: "4px", textDecorationColor: "var(--cr-paper-4)", marginTop: "16px" }}>
              {t("hero.ctaDemo")} {"→"}
            </Link>
          )}

          {/* Footnotes, grouped under one hairline instead of two floating
              rows: the counts (data) then the terms (fine print). The eye
              reads them as one block it can skip, not as two more claims. */}
          <div
            className="animate-fade-up-4 w-full"
            style={{ maxWidth: "520px", marginTop: "32px", paddingTop: "24px", borderTop: "1px solid var(--cr-rule)" }}
          >
            {trustCounts.length > 0 && (
              <div className="flex flex-wrap items-center justify-center lg:justify-start" style={{ gap: "24px" }}>
                {trustCounts.map(([v, label]) => (
                  <span key={label} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: "var(--cr-ink-2)", fontVariantNumeric: "tabular-nums" }}><CountUp value={v} /></span>{" "}{label}
                  </span>
                ))}
              </div>
            )}
            <p
              className="flex flex-wrap items-center justify-center lg:justify-start"
              style={{
                fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px",
                color: "var(--cr-ink-4)", gap: "8px",
                marginTop: trustCounts.length > 0 ? "12px" : 0,
              }}
            >
              <DiamondDot />
              <span>{t("hero.trustVetted")}</span>
              <span aria-hidden>·</span>
              <span>{t("hero.trustFee")}</span>
              {launch.isLaunch && (<><span aria-hidden>·</span><span>{t("hero.trustLaunch")}</span></>)}
            </p>
          </div>
        </div>

        {/* Live market panel: real figures, ticking, desktop only. Stepped all
            the way down from the card it was -- no shadow, no copper, 15px
            data -- so it reads as the ledger beside the claim, not a second
            headline arguing with the first. */}
        <aside className="hidden lg:block lg:col-span-5 animate-fade-up-2" aria-label={t("stats.capitalRaised")}>
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--cr-rule)" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cr-ink-4)" }}>
                {t("nav.data")}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--cr-ink-4)" }}>
                {/* Not green: green and red mean money direction on this
                    product, and a heartbeat is not a direction. */}
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cr-copper)", display: "inline-block" }} />
                LIVE
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1px", background: "var(--cr-rule)" }}>
              {/* Money and outcomes only -- the account counts came out
                  (Jack's call): capital sought, capital raised, deals done. */}
              {([
                [safeFormatCurrency(laneAll.reduce((a, l) => a + (l.funding_target ?? 0), 0)), t("listings.raising")],
                [safeFormatCurrency(stats.totalRaised), t("stats.capitalRaised")],
                [String(stats.dealsClosedCount), t("stats.dealsClosed")],
              ] as Array<[string, string]>).map(([v, label]) => (
                <div key={label} style={{ background: "var(--cr-paper-2)", padding: "16px" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "8px" }}>{label}</div>
                </div>
              ))}
            </div>
            {/* The three freshest rounds, as ledger rows. Named companies,
                so members only -- the figures above stay public because an
                aggregate says nothing about any one company. */}
            {canSeeMarket && (
            <div style={{ borderTop: "1px solid var(--cr-rule)" }}>
              {lane.slice(0, 3).map((l, i) => {
                const Row = (viewerRole ? Link : "div") as React.ElementType;
                return (
                <Row key={l.id} {...(viewerRole ? { href: `/startups/${l.slug}` } : {})}
                  style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", padding: "12px 16px", textDecoration: "none", borderTop: i > 0 ? "1px solid var(--cr-rule)" : "none" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "capitalize", whiteSpace: "nowrap" }}>{l.stage.replace(/_/g, " ")}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink-2)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{safeFormatCurrency(l.funding_target)}</span>
                </Row>
                );
              })}
            </div>
            )}
          </div>
        </aside>
        </div>
      </section>

      {/* ── 2. PROOF STRIP -- what it costs ──────────────────── */}
      {/* Was a dark band with three equally loud copper figures. The page gets
          exactly one band moment (the charter), and a strip of three shouts is
          a strip with no hierarchy: "2%" is the commercial fact, so it keeps
          the accent and the other two step down to ink. */}
      <section
        aria-label={t("hero.proofAria")}
        style={{ background: "var(--cr-paper-2)", borderTop: "1px solid var(--cr-rule-dark)", borderBottom: "1px solid var(--cr-rule-dark)" }}
      >
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-8 md:py-12">
          <div className="grid grid-cols-3">
            {proof.map(([value, label], i) => (
              <div
                key={label}
                className="flex flex-col items-center justify-start text-center px-2 md:px-4"
                style={{ borderLeft: i > 0 ? "1px solid var(--cr-rule)" : undefined }}
              >
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "24px", color: i === 0 ? "var(--cr-copper)" : "var(--cr-ink)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  {value}
                </div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "8px", lineHeight: 1.5 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          {/* Who pays -- stated in one plain sentence, right under the number. */}
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", textAlign: "center", maxWidth: "64ch", marginLeft: "auto", marginRight: "auto", marginTop: "24px", lineHeight: 1.65 }}>
            {t("hero.whoPays")}
          </p>
        </div>
      </section>

      {/* ── 3. HOW IT WORKS -- who it is for ─────────────────── */}
      {/* Both journeys survive; the reader picks one instead of scrolling past
          eight cells. Founders and investors each keep all four steps. */}
      <section aria-label={t("howItWorks.title")} style={{ background: "var(--cr-paper)" }}>
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-16 md:py-24">
          <div className="ruled-label" style={{ marginBottom: "24px" }}>{t("howItWorks.sectionLabel")}</div>

          <div role="tablist" aria-label={t("howItWorks.title")}
            style={{ display: "inline-flex", gap: "4px", padding: "4px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "999px", marginBottom: "32px" }}>
            {tracks.map((tr, i) => (
              <button
                key={tr.key}
                role="tab"
                id={`hiw-tab-${tr.key}`}
                aria-selected={track === i}
                aria-controls={`hiw-panel-${tr.key}`}
                onClick={() => setTrack(i)}
                style={{
                  padding: "8px 16px", minHeight: "40px", borderRadius: "999px", cursor: "pointer",
                  background: track === i ? "var(--cr-paper)" : "transparent",
                  border: track === i ? "1px solid var(--cr-rule-dark)" : "1px solid transparent",
                  color: track === i ? "var(--cr-ink)" : "var(--cr-ink-3)",
                  fontFamily: "'DM Sans', sans-serif", fontWeight: track === i ? 600 : 400, fontSize: "13px",
                }}
              >
                {tr.label}
              </button>
            ))}
          </div>

          {tracks.map((tr, i) => (
            <div
              key={tr.key}
              role="tabpanel"
              id={`hiw-panel-${tr.key}`}
              aria-labelledby={`hiw-tab-${tr.key}`}
              hidden={track !== i}
              className="grid md:grid-cols-2 lg:grid-cols-4"
              /* display is set inline, not left to the `hidden` attribute: the
                 UA's [hidden] rule loses to Tailwind's .grid, so the inactive
                 panel would otherwise stay on screen. Both panels stay in the
                 DOM so every step is still crawlable and searchable. */
              style={{ display: track === i ? "grid" : "none", gap: "1px", background: "var(--cr-rule)", border: "1px solid var(--cr-rule)", borderRadius: "4px", overflow: "hidden" }}
            >
              {tr.steps.map((step, si) => (
                <div key={step.title} style={{ background: "var(--cr-paper)", padding: "24px" }}>
                  {/* Numbered rail as a label, not a giant ghosted numeral:
                      the order is information, not decoration. */}
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "11px", letterSpacing: "0.12em", color: "var(--cr-copper)", marginBottom: "12px" }}>
                    {String(si + 1).padStart(2, "0")}
                  </div>
                  <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "8px" }}>{step.title}</h3>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.65 }}>{step.desc}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. WHO'S WAITING ────────────────────────────────── */}
      <MarketMatcher viewerRole={viewerRole} />

      {/* ── 5. THE MARKET, MOVING ───────────────────────────── */}
      {/* One slow lane of what is actually raising right now -- the ledger
          moving, sitting directly on top of the table it summarises. Data the
          page already holds; duplicated once for a seamless loop; pauses on
          hover; absent under reduced motion. Monotone now: a copper figure
          every third item made the tape flicker. */}
      {canSeeMarket && lane.length >= 4 && (
        <div className="cr-ticker" aria-label={t("ticker.aria")}
          style={{ borderTop: "1px solid var(--cr-rule)", borderBottom: "1px solid var(--cr-rule)", background: "var(--cr-paper-2)", padding: "12px 0" }}>
          <div className="cr-ticker-lane" style={{ "--ticker-secs": `${Math.max(60, lane.length * 3)}s` } as React.CSSProperties}>
            {[...lane, ...lane].map((l, i) => {
              const Item = (viewerRole ? Link : "span") as React.ElementType;
              return (
              <Item key={`${l.id}-${i}`} {...(viewerRole ? { href: `/startups/${l.slug}` } : {})} aria-hidden={i >= lane.length}
                style={{ display: "inline-flex", alignItems: "baseline", gap: "8px", padding: "0 24px", textDecoration: "none", borderLeft: "1px solid var(--cr-rule)" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink-2)" }}>{l.name}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "capitalize" }}>{l.stage.replace(/_/g, " ")}</span>
                {l.funding_target ? (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "11px", color: "var(--cr-ink-3)", fontVariantNumeric: "tabular-nums" }}>{safeFormatCurrency(l.funding_target)}</span>
                ) : null}
              </Item>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 6. TOP LISTINGS (only when there is something to show) ── */}
      {canSeeMarket && listings.length > 0 && (
        <section
          ref={listRef as React.RefObject<HTMLElement>}
          className="reveal"
          style={{ background: "var(--cr-paper)" }}
        >
          <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-16 md:py-24">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "24px" }}>
              <div className="ruled-label">{t("listings.title")}</div>
              <Link href="/startups" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none", whiteSpace: "nowrap" }}>
                {t("listings.viewAll")} →
              </Link>
            </div>

            {/* Tokens, not rgba literals; 4px corners like every other card;
                no copper gradient bar on top -- the table is the content. */}
            <div style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", overflow: "hidden", background: "var(--cr-paper)", boxShadow: "var(--cr-card-shadow)" }}>
              {/* Desktop header. No MRR column: revenue figures are gated to
                  the financials tier, and this table reaches every anonymous
                  visitor -- the number belongs behind the listing, not here. */}
              <div className="hidden md:flex items-center" style={{ padding: "12px 24px", background: "var(--cr-paper-2)", borderBottom: "1px solid var(--cr-rule-dark)" }}>
                <div style={{ minWidth: "32px" }} />
                <div style={{ ...TH, flex: 1, minWidth: "180px" }}>{t("listings.company")}</div>
                <div style={{ ...TH, minWidth: "140px", maxWidth: "140px" }}>{t("listings.industry")}</div>
                <div style={{ ...TH, minWidth: "112px", maxWidth: "112px" }}>{t("listings.stage")}</div>
                <div style={{ ...TH, minWidth: "112px", textAlign: "right" }}>{t("listings.raising")}</div>
                <div style={{ ...TH, minWidth: "72px", textAlign: "center" }}>{t("listings.score")}</div>
                <div style={{ minWidth: "48px" }} />
              </div>
              {/* Mobile header */}
              <div className="flex md:hidden items-center" style={{ padding: "12px 16px", background: "var(--cr-paper-2)", borderBottom: "1px solid var(--cr-rule-dark)" }}>
                <div style={{ ...TH, flex: 1 }}>{t("listings.company")}</div>
                <div style={{ ...TH, minWidth: "80px" }}>{t("listings.stage")}</div>
                <div style={{ ...TH, minWidth: "80px", textAlign: "right" }}>{t("listings.raising")}</div>
              </div>

              {listings.map((s, rowIdx) => {
                const isHovered = hoveredRow === s.id;
                const isLast = rowIdx === listings.length - 1;
                return (
                  <div
                    key={s.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`${s.name}: ${t("listings.view")}`}
                    className="listing-row listing-row-spotlight reveal-child flex items-center h-[64px] px-4 md:px-6"
                    onClick={() => router.push(`/startups/${s.slug}`)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/startups/${s.slug}`); } }}
                    onMouseEnter={() => setHoveredRow(s.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      e.currentTarget.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
                      e.currentTarget.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
                    }}
                    style={{
                      borderBottom: isLast ? "none" : "1px solid var(--cr-rule)",
                      background: isHovered ? "var(--cr-paper-3)" : "transparent",
                      transition: "background 120ms ease",
                      cursor: "pointer",
                    }}
                  >
                    {/* Padding inside the 32px box, so the rail number keeps
                        8px off the avatar without shifting the header. */}
                    <span className="listing-row-num hidden md:inline-block" style={{ minWidth: "32px", paddingRight: "8px" }}>
                      {String(rowIdx + 1).padStart(2, "0")}
                    </span>

                    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", background: "var(--cr-paper-3)",
                        border: "1px solid var(--cr-paper-4)", display: "flex", alignItems: "center",
                        justifyContent: "center", overflow: "hidden", flexShrink: 0,
                        fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink-3)",
                      }}>
                        {s.name.charAt(0)}
                      </div>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    </div>

                    <div className="hidden md:block" style={{ minWidth: "140px", maxWidth: "140px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.industry}
                    </div>

                    <div style={{ minWidth: "80px" }} className="md:min-w-[112px] md:max-w-[112px]"><StageBadge stage={s.stage} /></div>

                    {/* Ink, not copper: the score badge beside it is already
                        copper, and two accents in one row is no accent. */}
                    <div style={{ minWidth: "80px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)", fontVariantNumeric: "tabular-nums" }} className="md:min-w-[112px]">
                      {safeFormatCurrency(s.funding_target)}
                    </div>

                    <div className="hidden md:flex justify-center" style={{ minWidth: "72px" }}>
                      <ScoreBadge score={s.vaultrise_score} size="sm" />
                    </div>

                    <div style={{ minWidth: "48px", textAlign: "right" }} className="hidden md:block">
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: isHovered ? "var(--cr-ink)" : "var(--cr-ink-4)", transition: "color 120ms ease" }}>
                        {t("listings.view")} →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── 7. THE HEARTBEAT ────────────────────────────────── */}
      {/* Moved down beside the other evidence of a live market: it is proof,
          not an argument, so it belongs after the argument is made. */}
      <ActivityPulse />

      {/* ── 8. THE CHARTER -- the page's one band moment ─────── */}
      {/* The creed as a filed document. Redesigned per Jack: the guilloche
          corner read as green scribble in the business register and the
          accent-colored attribution shouted -- the artifact is now purely
          typographic (ref row, quote, quiet attribution). The wax seal
          survives only in the editorial register, where its wax reads as
          wax; business gets the clean sheet. */}
      <section aria-label={t("pullQuote.attribution")} style={{ background: "var(--cr-band-bg)", borderTop: "1px solid var(--cr-copper-br)", borderBottom: "1px solid var(--cr-copper-br)" }}>
        <div className="max-w-[760px] mx-auto px-6 md:px-10 py-16 md:py-24">
          <div style={{ position: "relative", border: "1px solid color-mix(in srgb, var(--cr-band-ink) 22%, transparent)", borderRadius: "2px", padding: "32px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid color-mix(in srgb, var(--cr-band-ink) 12%, transparent)" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--cr-band-ink-dim)" }}>
                CAPITALREACH {"·"} CHARTER
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "9px", letterSpacing: "0.14em", color: "var(--cr-band-ink-dim)" }}>
                {"№"} 0001{"–"}A
              </span>
            </div>
            <blockquote style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontStyle: "italic", fontSize: "clamp(22px, 3vw, 28px)", color: "var(--cr-band-ink)", lineHeight: 1.4, letterSpacing: "-0.01em", textWrap: "balance", margin: 0 }}>
              {"“"}{t("pullQuote.text")}{"”"}
            </blockquote>
            <p style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "10px", color: "var(--cr-band-ink-dim)", textTransform: "uppercase", letterSpacing: "0.14em", marginTop: "24px" }}>
              <span aria-hidden style={{ color: "var(--cr-copper)" }}>{"✦"}</span>
              {t("pullQuote.attribution")}
            </p>
            <div aria-hidden className="charter-seal" style={{ position: "absolute", bottom: "-16px", right: "24px", transform: "rotate(-8deg)", opacity: 0.9 }}>
              <WaxSeal size={64} />
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. CLOSING CTA -- what to do next ───────────────── */}
      <section aria-label={t("cta.label")} style={{ background: "var(--cr-paper)" }}>
        <div className="max-w-[720px] mx-auto px-6 md:px-10 py-16 md:py-24 flex flex-col items-center text-center">
          <div className="ruled-label" style={{ marginBottom: "24px" }}>{t("cta.label")}</div>
          <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(30px, 5vw, 52px)", color: "var(--cr-ink)", lineHeight: 1.05, letterSpacing: "-0.02em", textWrap: "balance" }}>
            {t("cta.headline1")}<br />{t("cta.headline2")}
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", lineHeight: 1.7, marginTop: "16px", maxWidth: "44ch" }}>
            {t("cta.sub")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center w-full sm:w-auto" style={{ gap: "12px", marginTop: "32px" }}>
            {viewerRole ? (
              <Link
                href={viewerRole === "startup" ? "/dashboard/startup" : viewerRole === "investor" ? "/dashboard/investor" : "/admin"}
                className="btn-copper-shimmer w-full sm:w-auto"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", padding: "12px 24px", borderRadius: "999px", border: "none", minHeight: "48px" }}
              >
                {t("hero.ctaDashboard")}
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/signup?role=startup"
                  className="btn-copper-shimmer w-full sm:w-auto"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "var(--cr-copper)", color: "var(--cr-band-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", padding: "12px 24px", borderRadius: "999px", border: "none", minHeight: "48px" }}
                >
                  {t("cta.listStartup")}
                </Link>
                <Link
                  href="/auth/signup?role=investor"
                  className="w-full sm:w-auto"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "transparent", color: "var(--cr-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "15px", padding: "12px 24px", borderRadius: "999px", border: "1px solid var(--cr-paper-4)", minHeight: "48px" }}
                >
                  {t("cta.exploreInvestor")} →
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
