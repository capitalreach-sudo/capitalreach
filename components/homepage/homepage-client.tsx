"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReveal } from "@/hooks/useReveal";
import { useTranslation } from "@/hooks/useTranslation";
import { ScoreBadge } from "@/components/ui/score-badge";
import { ScrollProgress } from "@/components/ui/ScrollProgress";
import { safeFormatCurrency, safeFormatMRR } from "@/lib/format";
import type { PlatformStats } from "@/lib/stats";
import type { LaunchStatus } from "@/lib/launchMode";
import type { ListingSnippet } from "@/app/page";

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
      background: "var(--cr-paper-2)", border: "1px solid #D8D0C4", borderRadius: "3px",
      padding: "3px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
      fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em",
      whiteSpace: "nowrap",
    }}>
      {stage}
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
export function HomepageClient({ stats, listings, launch, viewerRole = null }: Props & { viewerRole?: string | null }) {
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
      >
        <div className="hero-glow" aria-hidden />
        <div className="hero-noise" aria-hidden />

        <div
          className="max-w-[1040px] mx-auto w-full px-6 md:px-10 py-16 md:py-0 flex flex-col items-center text-center"
          style={{ position: "relative", zIndex: 1 }}
        >
          {launch.isLaunch ? (
            <Link
              href="/pricing"
              className="animate-fade-up"
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "36px",
                padding: "7px 14px", borderRadius: "999px", textDecoration: "none",
                background: "rgba(181,101,29,0.08)", border: "1px solid rgba(181,101,29,0.25)",
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
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", background: "transparent", color: "var(--cr-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "15px", padding: "12px 28px", borderRadius: "999px", border: "1px solid #D8D0C4" }}
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
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: "var(--cr-ink-2)" }}>{v.toLocaleString()}</span>{" "}{label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── 2. PROOF STRIP ──────────────────────────────────── */}
      <section
        aria-label="CapitalReach in three numbers"
        style={{ background: "var(--cr-band-bg)", borderTop: "1px solid rgba(181,101,29,0.2)", borderBottom: "1px solid rgba(181,101,29,0.2)" }}
      >
        <div className="max-w-[1200px] mx-auto px-6 md:px-10">
          <div className="grid grid-cols-3">
            {proof.map(([value, label], i) => (
              <div
                key={label}
                className="flex flex-col items-center justify-center text-center py-7 md:py-9"
                style={{ borderLeft: i > 0 ? "1px solid rgba(181,101,29,0.15)" : undefined }}
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

      {/* ── 3. TOP LISTINGS (only when there is something to show) ── */}
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

              {/* Desktop header */}
              <div className="hidden md:flex items-center" style={{ padding: "14px 20px", background: "var(--cr-paper-2)", borderBottom: "1px solid rgba(26,22,18,0.12)" }}>
                <div style={{ minWidth: "28px" }} />
                <div style={{ ...TH, flex: 1, minWidth: "180px" }}>{t("listings.company")}</div>
                <div style={{ ...TH, minWidth: "120px", maxWidth: "120px" }}>{t("listings.industry")}</div>
                <div style={{ ...TH, minWidth: "100px", maxWidth: "100px" }}>{t("listings.stage")}</div>
                <div style={{ ...TH, minWidth: "90px", textAlign: "right" }}>{t("listings.mrr")}</div>
                <div style={{ ...TH, minWidth: "100px", textAlign: "right" }}>{t("listings.raising")}</div>
                <div style={{ ...TH, minWidth: "64px", textAlign: "center" }}>{t("listings.score")}</div>
                <div style={{ minWidth: "48px" }} />
              </div>
              {/* Mobile header */}
              <div className="flex md:hidden items-center" style={{ padding: "14px 16px", background: "var(--cr-paper-2)", borderBottom: "1px solid rgba(26,22,18,0.12)" }}>
                <div style={{ ...TH, flex: 1 }}>{t("listings.company")}</div>
                <div style={{ ...TH, minWidth: "80px" }}>{t("listings.stage")}</div>
                <div style={{ ...TH, minWidth: "80px", textAlign: "right" }}>{t("listings.raising")}</div>
                <div style={{ minWidth: "36px" }} />
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
                        border: "1px solid #D8D0C4", display: "flex", alignItems: "center",
                        justifyContent: "center", overflow: "hidden", flexShrink: 0,
                        fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)",
                      }}>
                        {s.name.charAt(0)}
                      </div>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    </div>

                    <div className="hidden md:block" style={{ minWidth: "120px", maxWidth: "120px", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.industry}
                    </div>

                    <div style={{ minWidth: "80px" }} className="md:min-w-[100px] md:max-w-[100px]"><StageBadge stage={s.stage} /></div>

                    <div className="hidden md:block" style={{ minWidth: "90px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-2)" }}>
                      {safeFormatMRR(s.mrr)}
                    </div>

                    <div style={{ minWidth: "80px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)" }} className="md:min-w-[100px]">
                      {safeFormatCurrency(s.funding_target)}
                    </div>

                    <div className="hidden md:flex justify-center" style={{ minWidth: "64px" }}>
                      <ScoreBadge score={s.vaultrise_score} size="sm" />
                    </div>

                    <div style={{ minWidth: "36px", textAlign: "right" }} className="md:min-w-[48px]">
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
    </main>
  );
}
