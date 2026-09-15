"use client";

import Link from "next/link";
import { Bookmark, GitCompareArrows, Lock } from "lucide-react";
import { DemoBadge } from "@/components/shared/demo-badge";
import { STAGE_LABELS } from "@/lib/utils";
import { EntityLogo } from "@/components/shared/entity-logo";
import { roundCloseState } from "@/lib/round-close";
import { safeFormatCurrencyAmount, isImplausibleFundingTarget } from "@/lib/validators";
import { getInvestorPlan } from "@/lib/plans";
import type { Startup, SubscriptionTier } from "@/types";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";


// ── Props ─────────────────────────────────────────────────────────────────────

/**
 * The exact fields the card renders. Surfaces that fetch narrow projections
 * (related startups, search) must select all of these -- a full Startup
 * satisfies it too. Fields missing from a query fail the build now instead of
 * silently blanking parts of the card.
 *
 * The card no longer DRAWS every field here (the diet moved growth, runway and
 * the revenue pair to the detail page), but the projection stays whole so no
 * caller's select list has to churn with the card's layout.
 */
export type StartupCardData = Pick<Startup,
  "id" | "slug" | "name" | "tagline" | "industry" | "stage" | "funding_target" |
  "mrr" | "arr" | "growth_rate" | "runway_months" | "created_at" | "vaultrise_score" | "round_close_date"> & { verified_at?: string | null; round_state?: string | null; logo_url?: string | null; logo_color?: string | null; is_demo?: boolean };

interface StartupCardProps {
  startup:     StartupCardData;
  investorTier?: SubscriptionTier | null;
  isSaved?:    boolean;
  onSave?:     (startupId: string) => void;
  /** Optional compare toggle -- surfaces with a compare tray pass it; the
   *  card's contract is otherwise unchanged. */
  onCompare?:  (startupId: string) => void;
  isComparing?: boolean;
}

// ── Card ──────────────────────────────────────────────────────────────────────

/**
 * The specimen card, after the diet. It answers exactly what a browse decision
 * needs: who (name, tagline), what drawer it sits in (sector-stage meta line),
 * the ask (raising figure -- the card's ONE accent), and the score. Everything
 * else -- growth, runway, revenue, the serial number -- belongs to the detail
 * page. Action icons reveal on hover/focus-within; a coarse pointer has no
 * hover, so there they are always visible.
 */
export function StartupCard({ startup, investorTier, isSaved, onSave, onCompare, isComparing }: StartupCardProps) {
  const { t } = useTranslation();
  // Renders the fallback until the key lands in every locale (see data-centre.tsx).
  const tf = (key: string, fallback: string) => { const out = t(key); return out === key ? fallback : out; };
  const canSeeFinancials = getInvestorPlan(investorTier ?? null).features.viewFinancials;
  const closing          = roundCloseState(startup.round_close_date);
  const score            = startup.vaultrise_score ?? null;
  // The score is a paid signal on some plans: free investors are shown that
  // it exists, not what it is.
  const scoreLocked      = !investorTier || investorTier === "free";
  const hasActions       = Boolean(onSave || onCompare);

  // One meta line instead of a chip row: drawer (sector), shelf (stage), and
  // -- when the round is not simply open -- its state or deadline. Time and
  // status ride the same quiet line; the raise figure below keeps the accent.
  const metaBits: string[] = [
    startup.industry,
    STAGE_LABELS[startup.stage] ?? startup.stage.replace(/_/g, " "),
  ];
  if (startup.round_state === "oversubscribed" || startup.round_state === "closed") {
    metaBits.push(t(`startupDetail.round_${startup.round_state}`));
  } else if (closing) {
    metaBits.push(closing.kind === "closingSoon" ? t("startup.closingSoon") : t("startup.closesIn", { count: closing.days }));
  }

  function handleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onSave?.(startup.id);
    notify[isSaved ? "info" : "success"](isSaved ? t("toast.unsaved") : t("toast.saved"));
  }

  function handleCompare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onCompare?.(startup.id);
  }

  const iconButton: React.CSSProperties = {
    background: "none",
    border:     "none",
    cursor:     "pointer",
    padding:    "4px",
    display:    "flex",
    alignItems: "center",
  };

  return (
    // The card used to BE the link, with the upgrade hint nested inside it --
    // an <a> inside an <a>, which is invalid HTML. The browser parser closes
    // the outer anchor early, so the DOM stops matching what the server sent
    // and React fails to hydrate this subtree (three warnings per card).
    //
    // The link is now a stretched overlay covering the card instead of
    // wrapping it. The whole surface is still clickable and still a real
    // anchor -- middle-click and "open in new tab" keep working -- but it
    // contains nothing, so nothing can nest inside it.
    <div className="cr-startup-card" style={{ position: "relative" }}>
      {/* Hover reveal cannot live in inline styles: it needs :hover,
          :focus-within and a hover-capability media query. An icon whose state
          is ON (saved, comparing) stays visible -- hiding it would hide the
          state, not just the control. */}
      <style>{`
        .cr-startup-card .cr-card-act { opacity: 0; transition: opacity 120ms ease; }
        .cr-startup-card:hover .cr-card-act,
        .cr-startup-card:focus-within .cr-card-act,
        .cr-startup-card .cr-card-act.cr-on { opacity: 1; }
        @media (hover: none) { .cr-startup-card .cr-card-act { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .cr-startup-card .cr-card-act { transition: none; } }
      `}</style>
      <Link
        href={`/startups/${startup.slug}`}
        aria-label={startup.name}
        style={{ position: "absolute", inset: 0, zIndex: 1, textDecoration: "none" }}
      />
      <div
        style={{
          position:     "relative",
          display:      "flex",
          flexDirection: "column",
          background:   "var(--cr-paper-2)",
          border:       "1px solid var(--cr-rule-dark)",
          // 6px: the card/panel radius; 4px stays with controls.
          borderRadius: "6px",
          padding:      "16px",
          transition:   "background 120ms ease, border-color 120ms ease",
          cursor:       "pointer",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = "var(--cr-paper-3)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-paper-4)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = "var(--cr-paper-2)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)";
        }}
      >
        {/* Action rail: save and compare, above the stretched card link (or
            the overlay swallows the click). Revealed by the stylesheet above. */}
        {hasActions && (
          <div style={{ position: "absolute", top: "12px", right: "12px", zIndex: 2, display: "flex", gap: "4px" }}>
            {onCompare && (
              <button
                onClick={handleCompare}
                className={`cr-card-act${isComparing ? " cr-on" : ""}`}
                style={iconButton}
                aria-pressed={!!isComparing}
                aria-label={t("startups.compare")}
                title={t("startups.compare")}
              >
                <GitCompareArrows style={{ width: 16, height: 16, color: isComparing ? "var(--cr-copper)" : "var(--cr-ink-4)" }} />
              </button>
            )}
            {onSave && (
              <button
                onClick={handleSave}
                className={`cr-card-act${isSaved ? " cr-on" : ""}`}
                style={iconButton}
                aria-pressed={!!isSaved}
                aria-label={isSaved ? t("startup.removeWatchlist") : t("startup.saveWatchlist")}
              >
                <Bookmark style={{
                  width:  16,
                  height: 16,
                  color:  isSaved ? "var(--cr-copper)" : "var(--cr-ink-4)",
                  fill:   isSaved ? "var(--cr-copper)" : "transparent",
                }} />
              </button>
            )}
          </div>
        )}

        {/* Row 1 — Logo + name + tagline. The name wins truncation: the badge
            cannot shrink, the name ellipsizes. */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px", paddingRight: hasActions ? (onSave && onCompare ? "52px" : "28px") : 0 }}>
          <EntityLogo name={startup.name} logoUrl={startup.logo_url} logoColor={startup.logo_color} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", letterSpacing: "-0.01em", overflow: "hidden", whiteSpace: "nowrap" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{startup.name}</span>
              {startup.is_demo && <DemoBadge />}
            </p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {startup.tagline}
            </p>
          </div>
        </div>

        {/* Sector-stage meta line. The one caps voice: 11px/500/0.08em ink-3. */}
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--cr-ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "12px" }}>
          {metaBits.join(" · ")}
        </p>

        {/* Raise strip + score. One hairline above; the raising figure is the
            card's single accent, so the score sits in ink beside it. */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", paddingTop: "12px", borderTop: "1px solid var(--cr-rule)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>
              {t("startupDetail.raising")}
            </div>
            <div
              title={isImplausibleFundingTarget(startup.funding_target) ? tf("startup.raiseAmountInvalid", "This listing's raise amount didn't pass our checks and is hidden") : undefined}
              style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", color: isImplausibleFundingTarget(startup.funding_target) ? "var(--cr-ink-4)" : "var(--cr-copper)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {safeFormatCurrencyAmount(startup.funding_target)}
            </div>
          </div>
          {/* Ink rather than ui/score-badge's copper: the accent budget is one
              per card and the raise figure holds it. Same keys, same lock. */}
          {scoreLocked ? (
            <span title={t("startup.scoreLocked")} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", flexShrink: 0, lineHeight: 1 }}>
              <Lock style={{ width: 12, height: 12, color: "var(--cr-ink-4)" }} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--cr-ink-3)", maxWidth: "96px", textAlign: "right", lineHeight: 1.25 }}>{t("startup.scoreLabel")}</span>
            </span>
          ) : score != null ? (
            <span title={t("startup.scoreTitle", { score })} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", flexShrink: 0, lineHeight: 1 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)" }}>
                {score}
                <span style={{ fontSize: "0.6em", color: "var(--cr-ink-4)", fontWeight: 500 }}>/100</span>
              </span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--cr-ink-3)", maxWidth: "96px", textAlign: "right", lineHeight: 1.25 }}>{t("startup.scoreLabel")}</span>
            </span>
          ) : null}
        </div>

        {/* Upgrade hint: a link, so it keeps the link color. */}
        {!canSeeFinancials && investorTier !== undefined && (
          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--cr-rule)" }}>
            <Link
              href="/pricing"
              onClick={(e) => e.stopPropagation()}
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            "4px",
                fontFamily:     "'DM Sans', sans-serif",
                fontWeight:     400,
                fontSize:       "11px",
                color:          "var(--cr-copper)",
                textDecoration: "none",
                // Same reason as the action rail: sit above the card-wide link.
                position:       "relative",
                zIndex:         2,
              }}
            >
              <Lock style={{ width: 10, height: 10 }} />
              {t("startup.unlockScores")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
