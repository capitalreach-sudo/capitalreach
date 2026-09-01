"use client";

import Link from "next/link";
import { Bookmark, Lock, BadgeCheck } from "lucide-react";
import { DemoBadge } from "@/components/shared/demo-badge";
import { formatCurrency, daysSince, STAGE_LABELS } from "@/lib/utils";
import { EntityLogo } from "@/components/shared/entity-logo";
import { roundCloseState } from "@/lib/round-close";
import { safeFormatMRR, safeFormatCurrencyAmount } from "@/lib/validators";
import { getInvestorPlan } from "@/lib/plans";
import type { Startup, SubscriptionTier } from "@/types";
import { notify } from "@/components/ui/toast-notify";
import { useTranslation } from "@/hooks/useTranslation";
import { ScoreBadge } from "@/components/ui/score-badge";


// ── Props ─────────────────────────────────────────────────────────────────────

/**
 * The exact fields the card renders. Surfaces that fetch narrow projections
 * (related startups, search) must select all of these -- a full Startup
 * satisfies it too. Fields missing from a query fail the build now instead of
 * silently blanking parts of the card.
 */
export type StartupCardData = Pick<Startup,
  "id" | "slug" | "name" | "tagline" | "industry" | "stage" | "funding_target" |
  "mrr" | "arr" | "growth_rate" | "runway_months" | "created_at" | "vaultrise_score" | "round_close_date"> & { verified_at?: string | null; round_state?: string | null; logo_url?: string | null; logo_color?: string | null; is_demo?: boolean };

interface StartupCardProps {
  startup:     StartupCardData;
  investorTier?: SubscriptionTier | null;
  isSaved?:    boolean;
  onSave?:     (startupId: string) => void;
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function StartupCard({ startup, investorTier, isSaved, onSave }: StartupCardProps) {
  const { t } = useTranslation();
  const canSeeFinancials = getInvestorPlan(investorTier ?? null).features.viewFinancials;
  const isNew            = daysSince(startup.created_at) <= 5;
  const closing          = roundCloseState(startup.round_close_date);
  const score            = startup.vaultrise_score ?? null;

  function handleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onSave?.(startup.id);
    notify[isSaved ? "info" : "success"](isSaved ? t("toast.unsaved") : t("toast.saved"));
  }

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
    <div style={{ position: "relative" }}>
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
          borderRadius: "4px",
          padding:      "20px",
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

        {/* Bookmark */}
        {onSave && (
          <button
            onClick={handleSave}
            style={{
              position:   "absolute",
              top:        "16px",
              right:      "16px",
              // Above the stretched card link, or the overlay swallows the click.
              zIndex:     2,
              background: "none",
              border:     "none",
              cursor:     "pointer",
              padding:    "2px",
              display:    "flex",
              alignItems: "center",
            }}
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

        {/* Row 1 — Logo + name + score */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "14px", paddingRight: onSave ? "24px" : 0 }}>
          <EntityLogo name={startup.name} logoUrl={startup.logo_url} logoColor={startup.logo_color} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "16px", color: "var(--cr-ink)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{startup.name}</span>
              {startup.verified_at && <BadgeCheck aria-label={t("investors.verifiedBadge")} style={{ width: 14, height: 14, color: "var(--cr-up)", flexShrink: 0 }} />}
              {startup.is_demo && <DemoBadge />}
              {(startup.round_state === "oversubscribed" || startup.round_state === "closed") && (
                <span style={{ flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontStyle: "normal", fontWeight: 600, fontSize: "9px", letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 6px", borderRadius: "3px",
                  background: startup.round_state === "oversubscribed" ? "var(--cr-copper-bg)" : "var(--cr-paper-3)", color: startup.round_state === "oversubscribed" ? "var(--cr-copper)" : "var(--cr-ink-4)", border: `1px solid ${startup.round_state === "oversubscribed" ? "var(--cr-copper-br)" : "var(--cr-rule-dark)"}` }}>
                  {t(`startupDetail.round_${startup.round_state}`)}
                </span>
              )}
            </p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {startup.tagline}
            </p>
          </div>
          {/* The score is a paid signal on some plans: free investors are
              shown that it exists, not what it is. */}
          <ScoreBadge score={score} locked={!investorTier || investorTier === "free"} />
        </div>

        {/* Row 2 — Badges */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
          <span style={{
            background:    "transparent",
            border:        "1px solid var(--cr-rule-dark)",
            color:         "var(--cr-ink-3)",
            fontFamily:    "'DM Sans', sans-serif",
            fontWeight:    500,
            fontSize:      "10px",
            borderRadius:  "2px",
            padding:       "2px 8px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            {startup.industry}
          </span>
          <span style={{
            background:    "transparent",
            border:        "1px solid var(--cr-rule)",
            color:         "var(--cr-ink-4)",
            fontFamily:    "'DM Sans', sans-serif",
            fontWeight:    400,
            fontSize:      "10px",
            borderRadius:  "2px",
            padding:       "2px 8px",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}>
            {STAGE_LABELS[startup.stage] ?? startup.stage}
          </span>
          {isNew && (
            <span style={{
              background:    "transparent",
              border:        "1px solid rgba(45,106,79,0.35)",
              color:         "var(--cr-up)",
              fontFamily:    "'DM Sans', sans-serif",
              fontWeight:    500,
              fontSize:      "10px",
              borderRadius:  "3px",
              padding:       "2px 8px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              {t("startup.new")}
            </span>
          )}
          {/* Copper when urgent (≤14d), otherwise quiet — see lib/round-close
              for why a passed date says "closing soon" instead of a negative
              count and why >60d shows nothing. */}
          {closing && (
            <span style={{
              background:    closing.kind === "days" && !closing.urgent ? "transparent" : "var(--cr-copper-bg)",
              border:        "1px solid var(--cr-copper-br)",
              color:         "var(--cr-copper)",
              fontFamily:    "'DM Sans', sans-serif",
              fontWeight:    closing.kind === "closingSoon" || closing.urgent ? 600 : 500,
              fontSize:      "10px",
              borderRadius:  "3px",
              padding:       "2px 8px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              {closing.kind === "closingSoon"
                ? t("startup.closingSoon")
                : t("startup.closesIn", { count: closing.days })}
            </span>
          )}
        </div>

        {/* Row 3 — Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
          {[
            { key: "mrr",    label: t("startupDetail.mrr"),    value: startup.mrr         ? safeFormatMRR(startup.mrr)                                              : null, gated: true  },
            { key: "arr",    label: t("startupDetail.arr"),    value: startup.arr         ? safeFormatMRR(startup.arr)                                              : null, gated: true  },
            { key: "growth", label: t("startupDetail.growth"), value: startup.growth_rate != null ? `${startup.growth_rate >= 0 ? "+" : ""}${startup.growth_rate}%`        : null, gated: false },
          ].map(({ key, label, value, gated }) => (
            <div key={key} style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", padding: "10px 10px 8px" }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>
                {label}
              </div>
              {gated && !canSeeFinancials ? (
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <div className="skeleton" style={{ height: 13, width: 36, borderRadius: "2px" }} />
                  <Lock style={{ width: 10, height: 10, color: "var(--cr-ink-4)" }} />
                </div>
              ) : value ? (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                  fontSize:   "13px",
                  color:      startup.growth_rate != null && key === "growth"
                    ? startup.growth_rate >= 0 ? "var(--cr-up)" : "var(--cr-down)"
                    : "var(--cr-ink)",
                }}>
                  {value}
                </div>
              ) : (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>—</div>
              )}
            </div>
          ))}
        </div>

        {/* Row 4 — Raise strip */}
        <div style={{
          display:       "flex",
          alignItems:    "center",
          justifyContent: "space-between",
          paddingTop:    "12px",
          borderTop:     "1px solid var(--cr-rule)",
        }}>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>
              {t("startupDetail.raising")}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", color: "var(--cr-copper)" }}>
              {safeFormatCurrencyAmount(startup.funding_target)}
            </div>
          </div>
          {startup.runway_months != null && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>
              {t("startup.runwayMonths", { n: startup.runway_months })}
            </div>
          )}
        </div>

        {/* Upgrade hint */}
        {!canSeeFinancials && investorTier !== undefined && (
          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--cr-rule)" }}>
            <Link
              href="/pricing"
              onClick={(e) => e.stopPropagation()}
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            "5px",
                fontFamily:     "'DM Sans', sans-serif",
                fontWeight:     400,
                fontSize:       "11px",
                color:          "var(--cr-copper)",
                textDecoration: "none",
                // Same reason as the bookmark: sit above the card-wide link.
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
