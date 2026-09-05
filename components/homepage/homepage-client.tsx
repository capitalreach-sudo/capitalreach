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
import { MarketMatcher } from "@/components/homepage/market-matcher";
import { FeeSlider } from "@/components/homepage/fee-slider";
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
      padding: "3px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
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
 * Four sections: hero → proof strip → top listings (only when any exist) →
 * (footer is rendered by the page). The headline is plain CSS-animated text,
 * so it can never render as concatenated words. Every money figure goes
 * through the safe formatters, so a bad test value renders "—", never
 * "$100000000B". Counts are shown only when they are greater than zero —
 * "0 startups listed" is not a trust signal.
 */
export function HomepageClient({ stats, listings, tickerListings, launch, viewerRole = null }: Props & { viewerRole?: string | null }) {
  const laneAll = (tickerListings && tickerListings.length ? tickerListings : listings);
  // The marquee renders the lane TWICE for the seamless loop, so DOM cost is
  // 2x lane length. 150 rounds is minutes of unrepeated tape; more is payload.
  const lane = laneAll.slice(0, 150);
  const { t } = useTranslation();
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const router  = useRouter();
  const listRef = useReveal();

  // Pluralised per locale ("1 startup listed", "2 startups listed").
  const trustCounts: [number, string][] = [
    [stats.startupCount,     t("trustIndicators.startupsListed",    { count: stats.startupCount })],
    [stats.investorCount,    t("trustIndicators.verifiedInvestors", { count: stats.investorCount })],
    [stats.dealsClosedCount, t("trustIndicators.dealsClosed",       { count: stats.dealsClosedCount })],
  ].filter(([v]) => (v as number) > 0) as [number, string][];

  const proof: [string, string][] = [
    ["2%",   t("hero.proofFee")],
    ["€0",   t("hero.proofUpfront")],
    ["100%", t("hero.proofVetted")],
  ];

  return (
    <main style={{ background: "var(--cr-paper)" }}>
      <ScrollProgress />

      {/* ── 1. HERO ─────────────────────────────────────────── */}
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
          className="max-w-[1200px] mx-auto w-full px-6 md:px-10 py-16 md:py-0 grid lg:grid-cols-12 gap-12 items-center"
          style={{ position: "relative", zIndex: 1 }}
        >
        <div className="lg:col-span-7 flex flex-col items-center text-center lg:items-start lg:text-left">
          {launch.isLaunch ? (
            <Link
              href="/pricing"
              className="animate-fade-up"
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "36px",
                padding: "7px 14px", borderRadius: "999px", textDecoration: "none",
                background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)",
                letterSpacing: "0.02em",
              }}
            >
              <span aria-hidden>✦</span>
              {t("hero.launchPill", { count: launch.memberCount, target: launch.target })}
            </Link>
          ) : (
            <div className="ruled-label animate-fade-up" style={{ marginBottom: "40px", justifyContent: "center" }}>
              {t("hero.eyebrow")}
            </div>
          )}

          <h1
            className="animate-fade-up-1"
            style={{
              fontFamily:    "'Playfair Display', Georgia, serif",
              fontWeight:    700,
              fontStyle:     "italic",
              fontSize:      "clamp(38px, 6.6vw, 78px)",
              color:         "var(--cr-ink)",
              lineHeight:    1.02,
              textWrap:      "balance",
              letterSpacing: "-0.02em",
              marginBottom:  "28px",
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
              fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "17px",
              color: "var(--cr-ink-3)", lineHeight: 1.7, maxWidth: "520px",
            }}
          >
            {t("hero.oneLiner")}
          </p>

          {/* CTAs */}
          <div
            className="animate-fade-up-3 flex flex-col sm:flex-row items-center justify-center w-full sm:w-auto"
            style={{ gap: "12px", marginTop: "36px" }}
          >
            <Link
              href={viewerRole === "startup" ? "/dashboard/startup" : viewerRole === "investor" ? "/dashboard/investor" : viewerRole === "admin" ? "/admin" : "/auth/signup?role=startup"}
              className="btn-copper-shimmer w-full sm:w-auto"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", padding: "13px 28px", borderRadius: "999px", border: "none" }}
            >
              {viewerRole ? t("hero.ctaDashboard") : t("hero.ctaPrimary")}
            </Link>
            <Link
              href="/startups"
              className="w-full sm:w-auto"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "transparent", color: "var(--cr-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "15px", padding: "12px 28px", borderRadius: "999px", border: "1px solid var(--cr-paper-4)" }}
            >
              {t("hero.ctaSecondary")} →
            </Link>
          </div>

          {/* Trust row */}
          <p
            className="animate-fade-up-4"
            style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px",
              color: "var(--cr-ink-4)", marginTop: "28px", display: "flex", alignItems: "center",
              justifyContent: "center", gap: "10px", flexWrap: "wrap",
            }}
          >
            <span><span style={{ color: "var(--cr-copper)" }}>✦</span> {t("hero.trustVetted")}</span>
            <span aria-hidden>·</span>
            <span>{t("hero.trustFee")}</span>
            {launch.isLaunch && (<><span aria-hidden>·</span><span>{t("hero.trustLaunch")}</span></>)}
          </p>

          {/* Live counts — only the ones that are > 0 */}
          {trustCounts.length > 0 && (
            <div className="animate-fade-up-4" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "24px", marginTop: "18px", flexWrap: "wrap" }}>
              {trustCounts.map(([v, label]) => (
                <div key={label} style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <DiamondDot />
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)" }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: "var(--cr-ink-2)" }}><CountUp value={v} /></span>{" "}{label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live market panel: real figures, ticking, desktop only. The page
            opens like a terminal, not a brochure -- the numbers ARE the pitch. */}
        <aside className="hidden lg:block lg:col-span-5 animate-fade-up-2" aria-label={t("stats.capitalRaised")}>
          <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", boxShadow: "var(--cr-card-shadow)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--cr-rule)" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cr-ink-3)" }}>
                {t("nav.data")}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--cr-up)" }}>
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cr-up)", display: "inline-block" }} />
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
                <div key={label} style={{ background: "var(--cr-paper-2)", padding: "14px 16px" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "20px", color: "var(--cr-copper)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "6px" }}>{label}</div>
                </div>
              ))}
            </div>
            {/* The three freshest rounds, as ledger rows. */}
            <div style={{ borderTop: "1px solid var(--cr-rule)" }}>
              {lane.slice(0, 3).map((l, i) => {
                const Row = (viewerRole ? Link : "div") as React.ElementType;
                return (
                <Row key={l.id} {...(viewerRole ? { href: `/startups/${l.slug}` } : {})}
                  style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", padding: "10px 16px", textDecoration: "none", borderTop: i > 0 ? "1px solid var(--cr-rule)" : "none" }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "capitalize", whiteSpace: "nowrap" }}>{l.stage.replace(/_/g, " ")}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "11px", color: "var(--cr-copper)", whiteSpace: "nowrap" }}>{safeFormatCurrency(l.funding_target)}</span>
                </Row>
                );
              })}
            </div>
          </div>
        </aside>
        </div>
      </section>

      {/* ── 2. PROOF STRIP ──────────────────────────────────── */}
      <section
        aria-label={t("hero.proofAria")}
        style={{ background: "var(--cr-band-bg)", borderTop: "1px solid var(--cr-copper-br)", borderBottom: "1px solid var(--cr-copper-br)", position: "relative", overflow: "hidden" }}
      >
        <div className="hero-noise" aria-hidden />
        <div className="max-w-[1200px] mx-auto px-6 md:px-10" style={{ position: "relative" }}>
          <div className="grid grid-cols-3">
            {proof.map(([value, label], i) => (
              <div
                key={label}
                className="flex flex-col items-center justify-center text-center py-7 md:py-9"
                style={{ borderLeft: i > 0 ? "1px solid var(--cr-copper-br)" : undefined }}
              >
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "clamp(22px, 4vw, 28px)", color: "var(--cr-copper)", lineHeight: 1 }}>
                  {value}
                </div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-band-ink-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "8px" }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          {/* Who pays — stated in one plain sentence, right under the number. */}
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-band-ink-dim)", textAlign: "center", padding: "0 0 16px", lineHeight: 1.5 }}>
            {t("hero.whoPays")}
          </p>
        </div>
      </section>

      {/* ── 2b. LIVE ROUNDS TICKER ──────────────────────────── */}
      {/* One slow lane of what is actually raising right now — the ledger
          moving. Data the page already holds; duplicated once for a
          seamless loop; pauses on hover; absent under reduced motion. */}
      {lane.length >= 4 && (
        <div className="cr-ticker" aria-label={t("ticker.aria")}
          style={{ borderBottom: "1px solid var(--cr-rule)", background: "var(--cr-paper)", padding: "10px 0" }}>
          <div className="cr-ticker-lane" style={{ "--ticker-secs": `${Math.max(60, lane.length * 3)}s` } as React.CSSProperties}>
            {[...lane, ...lane].map((l, i) => {
              const Item = (viewerRole ? Link : "span") as React.ElementType;
              return (
              <Item key={`${l.id}-${i}`} {...(viewerRole ? { href: `/startups/${l.slug}` } : {})} aria-hidden={i >= lane.length}
                style={{ display: "inline-flex", alignItems: "baseline", gap: "8px", padding: "0 28px", textDecoration: "none", borderLeft: "1px solid var(--cr-rule)" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink-2)" }}>{l.name}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "capitalize" }}>{l.stage.replace(/_/g, " ")}</span>
                {l.funding_target ? (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "11px", color: "var(--cr-copper)" }}>{safeFormatCurrency(l.funding_target)}</span>
                ) : null}
              </Item>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 2c. THE HEARTBEAT ──────────────────────────────── */}
      <ActivityPulse />

      {/* ── 3. HOW IT WORKS ─────────────────────────────────── */}
      {/* Two tracks side by side: the reader self-selects founder or investor
          and reads four steps, not a wall of features. Every string here has
          existed in all fifteen locales since the howItWorks group shipped --
          the section costs nothing new to localise. */}
      <section aria-label={t("howItWorks.title")} style={{ background: "var(--cr-paper)", borderTop: "1px solid var(--cr-rule)" }}>
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-16 md:py-24">
          <div className="ruled-label" style={{ marginBottom: "40px" }}>{t("howItWorks.sectionLabel")}</div>
          <div className="grid md:grid-cols-2 gap-12 md:gap-16">
            {([
              { track: t("howItWorks.forFounders"),  steps: [1, 2, 3, 4].map(n => ({ title: t(`howItWorks.f${n}title`), desc: t(`howItWorks.f${n}desc`) })) },
              { track: t("howItWorks.forInvestors"), steps: [1, 2, 3, 4].map(n => ({ title: t(`howItWorks.i${n}title`), desc: t(`howItWorks.i${n}desc`) })) },
            ]).map(({ track, steps }) => (
              <div key={track}>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(22px, 3vw, 28px)", color: "var(--cr-ink)", letterSpacing: "-0.01em", marginBottom: "28px" }}>
                  {track}
                </h2>
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {steps.map((step, i) => (
                    <li key={step.title} style={{ display: "flex", gap: "18px", paddingBottom: i === steps.length - 1 ? 0 : "22px", position: "relative" }}>
                      {/* Rail: number + connecting rule, the ledger line down the steps. */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-copper)", border: "1px solid var(--cr-copper-br)", background: "var(--cr-copper-bg)", borderRadius: "999px", width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {i < steps.length - 1 && <span aria-hidden style={{ flex: 1, width: 1, background: "var(--cr-rule)", marginTop: 6 }} />}
                      </div>
                      <div style={{ paddingTop: 3 }}>
                        <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "5px" }}>{step.title}</h3>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13.5px", color: "var(--cr-ink-3)", lineHeight: 1.65, maxWidth: "46ch" }}>{step.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3b. WHO'S WAITING ───────────────────────────────── */}
      <MarketMatcher />

      {/* ── 4. TOP LISTINGS (only when there is something to show) ── */}
      {listings.length > 0 && (
        <section
          ref={listRef as React.RefObject<HTMLElement>}
          className="reveal"
          style={{ background: "var(--cr-paper)" }}
        >
          <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-16 md:py-20">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <div className="ruled-label">{t("listings.title")}</div>
              <Link href="/startups" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none" }}>
                {t("listings.viewAll")} →
              </Link>
            </div>

            <div style={{ border: "1px solid rgba(26,22,18,0.15)", borderRadius: "8px", overflow: "hidden", background: "var(--cr-paper)", boxShadow: "0 2px 16px rgba(26,22,18,0.04)" }}>
              <div style={{ height: "3px", background: "linear-gradient(90deg, #8A4A15, #B5651D, #D4842A)" }} />

              {/* Desktop header. No MRR column: revenue figures are gated to
                  the financials tier, and this table reaches every anonymous
                  visitor -- the number belongs behind the listing, not here. */}
              <div className="hidden md:flex items-center" style={{ padding: "14px 20px", background: "var(--cr-paper-2)", borderBottom: "1px solid rgba(26,22,18,0.12)" }}>
                <div style={{ minWidth: "28px" }} />
                <div style={{ ...TH, flex: 1, minWidth: "180px" }}>{t("listings.company")}</div>
                <div style={{ ...TH, minWidth: "140px", maxWidth: "140px" }}>{t("listings.industry")}</div>
                <div style={{ ...TH, minWidth: "110px", maxWidth: "110px" }}>{t("listings.stage")}</div>
                <div style={{ ...TH, minWidth: "110px", textAlign: "right" }}>{t("listings.raising")}</div>
                <div style={{ ...TH, minWidth: "72px", textAlign: "center" }}>{t("listings.score")}</div>
                <div style={{ minWidth: "48px" }} />
              </div>
              {/* Mobile header */}
              <div className="flex md:hidden items-center" style={{ padding: "14px 16px", background: "var(--cr-paper-2)", borderBottom: "1px solid rgba(26,22,18,0.12)" }}>
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
                    aria-label={`${s.name} — ${t("listings.view")}`}
                    className="listing-row listing-row-spotlight reveal-child flex items-center h-[60px] px-4 md:px-5"
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
                      borderBottom: isLast ? "none" : "1px solid rgba(26,22,18,0.08)",
                      background: isHovered ? "var(--cr-paper-3)" : "transparent",
                      transition: "background 120ms ease",
                      cursor: "pointer",
                    }}
                  >
                    <span className="listing-row-num hidden md:inline-block" style={{ minWidth: "28px", paddingLeft: "4px" }}>
                      {String(rowIdx + 1).padStart(2, "0")}
                    </span>

                    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%", background: "var(--cr-paper-3)",
                        border: "1px solid var(--cr-paper-4)", display: "flex", alignItems: "center",
                        justifyContent: "center", overflow: "hidden", flexShrink: 0,
                        fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)",
                      }}>
                        {s.name.charAt(0)}
                      </div>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    </div>

                    <div className="hidden md:block" style={{ minWidth: "140px", maxWidth: "140px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.industry}
                    </div>

                    <div style={{ minWidth: "80px" }} className="md:min-w-[110px] md:max-w-[110px]"><StageBadge stage={s.stage} /></div>

                    <div style={{ minWidth: "80px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)" }} className="md:min-w-[110px]">
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

      {/* ── 4b. THE FEE, FELT ───────────────────────────────── */}
      <FeeSlider />

      {/* ── 5. PULL QUOTE ───────────────────────────────────── */}
      {/* The creed, said once, on the dark slab. Serif in editorial; the
          business style flattens it to sans automatically. */}
      <section aria-label={t("pullQuote.attribution")} style={{ background: "var(--cr-band-bg)", borderTop: "1px solid var(--cr-copper-br)", borderBottom: "1px solid var(--cr-copper-br)" }}>
        <div className="max-w-[880px] mx-auto px-6 md:px-10 py-16 md:py-20 text-center">
          <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(22px, 3.4vw, 34px)", color: "var(--cr-band-ink)", lineHeight: 1.35, letterSpacing: "-0.01em", textWrap: "balance" }}>
            “{t("pullQuote.text")}”
          </p>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.14em", marginTop: "20px" }}>
            {t("pullQuote.attribution")}
          </p>
        </div>
      </section>

      {/* ── 6. CLOSING CTA ──────────────────────────────────── */}
      <section aria-label={t("cta.label")} style={{ background: "var(--cr-paper)" }}>
        <div className="max-w-[720px] mx-auto px-6 md:px-10 py-20 md:py-28 flex flex-col items-center text-center">
          <div className="ruled-label" style={{ marginBottom: "28px", justifyContent: "center" }}>{t("cta.label")}</div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(30px, 5vw, 52px)", color: "var(--cr-ink)", lineHeight: 1.05, letterSpacing: "-0.02em", textWrap: "balance" }}>
            {t("cta.headline1")}<br />{t("cta.headline2")}
          </h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", lineHeight: 1.7, marginTop: "18px", maxWidth: "44ch" }}>
            {t("cta.sub")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center w-full sm:w-auto" style={{ gap: "12px", marginTop: "32px" }}>
            {viewerRole ? (
              <Link
                href={viewerRole === "startup" ? "/dashboard/startup" : viewerRole === "investor" ? "/dashboard/investor" : "/admin"}
                className="btn-copper-shimmer w-full sm:w-auto"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", padding: "13px 28px", borderRadius: "999px", border: "none" }}
              >
                {t("hero.ctaDashboard")}
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/signup?role=startup"
                  className="btn-copper-shimmer w-full sm:w-auto"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "var(--cr-copper)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", padding: "13px 28px", borderRadius: "999px", border: "none" }}
                >
                  {t("cta.listStartup")}
                </Link>
                <Link
                  href="/auth/signup?role=investor"
                  className="w-full sm:w-auto"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "transparent", color: "var(--cr-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "15px", padding: "12px 28px", borderRadius: "999px", border: "1px solid var(--cr-paper-4)" }}
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
