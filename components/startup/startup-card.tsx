"use client";

import Link from "next/link";
import { Bookmark, GitCompareArrows } from "lucide-react";
import { DemoBadge } from "@/components/shared/demo-badge";
import { STAGE_LABELS, formatCurrency } from "@/lib/utils";
import { EntityLogo } from "@/components/shared/entity-logo";
import { roundCloseState } from "@/lib/round-close";
import { isValidFundingTarget } from "@/lib/validators";
import type { Startup, SubscriptionTier } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";


// ── Props ─────────────────────────────────────────────────────────────────────

/**
 * The exact fields the card renders. Surfaces that fetch narrow projections
 * (related startups, search) must select all of these -- a full Startup
 * satisfies it too. Fields missing from a query fail the build now instead of
 * silently blanking parts of the card.
 *
 * The card does not DRAW every field here (growth, runway and the revenue pair
 * belong to the detail page), but the projection stays whole so no caller's
 * select list has to churn with the card's layout.
 */
export type StartupCardData = Pick<Startup,
  "id" | "slug" | "name" | "tagline" | "industry" | "stage" | "funding_target" |
  "mrr" | "arr" | "growth_rate" | "runway_months" | "created_at" | "vaultrise_score" | "round_close_date"> & { verified_at?: string | null; round_state?: string | null; logo_url?: string | null; logo_color?: string | null; is_demo?: boolean };

interface StartupCardProps {
  startup:     StartupCardData;
  /** Governs whether the score figure shows. Free and unknown plans see none;
   *  the listing surface says so once, above its cards. */
  investorTier?: SubscriptionTier | null;
  isSaved?:    boolean;
  onSave?:     (startupId: string) => void;
  /** Optional compare toggle; the card's contract is otherwise unchanged. */
  onCompare?:  (startupId: string) => void;
  isComparing?: boolean;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The one meta line: sector, stage and, when the round is not simply open, its
 * state or deadline. Shared with the /startups ledger so a card and a row
 * describe a listing in the same words.
 */
export function startupMetaBits(
  startup: { industry: string; stage: string; round_state?: string | null; round_close_date?: string | null },
  t: Translate,
): string[] {
  const bits: string[] = [
    startup.industry,
    STAGE_LABELS[startup.stage] ?? startup.stage.replace(/_/g, " "),
  ];
  const closing = roundCloseState(startup.round_close_date);
  if (startup.round_state === "oversubscribed" || startup.round_state === "closed") {
    bits.push(t(`startupDetail.round_${startup.round_state}`));
  } else if (closing) {
    bits.push(closing.kind === "closingSoon" ? t("startup.closingSoon") : t("startup.closesIn", { count: closing.days }));
  }
  return bits;
}

/*
 * Hover changes the background only. Actions reserve room only where they can
 * be seen: on hover-capable pointers (revealed on hover or focus), or when one
 * is on. A touch pointer shows only the actions that are on.
 */
const CARD_CSS = `
.cr-startup-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 1rem;
  border: 1px solid var(--cr-rule-dark);
  border-radius: 6px;
  background-color: var(--cr-paper-2);
  transition: background-color 120ms var(--ease-out);
}
@media (hover: hover) {
  .cr-startup-card:hover { background-color: var(--cr-paper-3); }
}
.cr-startup-card:has(.cr-startup-card__link:active) {
  background-color: color-mix(in oklab, var(--cr-paper-3) 50%, var(--cr-paper-4));
  transition-duration: 100ms;
}
.cr-startup-card__link {
  position: absolute;
  inset: 0;
  z-index: var(--z-raised);
  border-radius: inherit;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.cr-startup-card__link:focus-visible {
  outline: 2px solid var(--cr-copper) !important;
  outline-offset: 2px;
  box-shadow: none !important;
}
.cr-startup-card__head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  min-width: 0;
  margin-block-end: 0.75rem;
}
.cr-startup-card__id { flex: 1 1 auto; min-width: 0; }
.cr-startup-card__name {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
  margin: 0;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.9375rem;
  font-weight: 600;
  font-style: normal;
  line-height: 1.4;
  letter-spacing: 0;
  color: var(--cr-ink);
  white-space: nowrap;
}
.cr-startup-card__name > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.cr-startup-card__tagline {
  margin: 0.125rem 0 0;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.4;
  color: var(--cr-ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cr-startup-card__meta {
  margin: 0 0 0.75rem;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cr-ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cr-startup-card__foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding-block-start: 0.75rem;
  border-block-start: 1px solid var(--cr-rule);
}
.cr-startup-card__figure {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace;
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--cr-ink);
  font-variant-numeric: tabular-nums;
}
.cr-startup-card__absent {
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem;
  font-weight: 400;
  color: var(--cr-ink-3);
}
.cr-startup-card__score {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
}
.cr-startup-card__score-label {
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem;
  font-weight: 400;
  color: var(--cr-ink-3);
}
.cr-startup-card__rail {
  position: relative;
  z-index: calc(var(--z-raised) + 1);
  flex: none;
  display: flex;
  margin-block: -0.5rem;
  margin-inline-end: -0.5rem;
}
.cr-startup-card__act {
  display: inline-grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 0;
  border-radius: var(--cr-radius-control);
  background-color: transparent;
  color: var(--cr-ink-3);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 120ms var(--ease-out), background-color 120ms var(--ease-out), color 120ms var(--ease-out);
}
.cr-startup-card__act[aria-pressed="true"] { color: var(--cr-copper); }
.cr-startup-card__act:active { background-color: color-mix(in oklab, var(--cr-paper-3) 50%, var(--cr-paper-4)); }
.cr-startup-card__act:focus-visible {
  outline: 2px solid var(--cr-copper) !important;
  outline-offset: -2px;
  box-shadow: none !important;
}
@media (hover: hover) {
  .cr-startup-card__act:hover { color: var(--cr-ink); }
  .cr-startup-card__act[aria-pressed="true"]:hover { color: var(--cr-copper); }
  .cr-startup-card__act:not([aria-pressed="true"]) { opacity: 0; }
  .cr-startup-card:hover .cr-startup-card__act,
  .cr-startup-card:focus-within .cr-startup-card__act { opacity: 1; }
}
@media (hover: none) {
  .cr-startup-card:not([data-on]) .cr-startup-card__rail { display: none; }
  .cr-startup-card__act:not([aria-pressed="true"]) { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .cr-startup-card, .cr-startup-card__act { transition: none; }
}
`;

// ── Card ──────────────────────────────────────────────────────────────────────

/**
 * The specimen card, after the diet. It answers what a browse decision needs:
 * who (name, tagline), where it sits (sector-stage meta line), the ask (the
 * raising figure, in ink) and, for plans that carry it, the score. Growth,
 * runway and revenue belong to the detail page. The paywall is never repeated
 * per card; the surface renders one upgrade line above its list.
 */
export function StartupCard({ startup, investorTier, isSaved, onSave, onCompare, isComparing }: StartupCardProps) {
  const { t } = useTranslation();
  const score = startup.vaultrise_score ?? null;
  const scoreVisible = score != null && !!investorTier && investorTier !== "free";
  const hasActions = Boolean(onSave || onCompare);
  const anyOn = Boolean((onSave && isSaved) || (onCompare && isComparing));
  const metaBits = startupMetaBits(startup, t);
  const notStated = t("common.ledger.notStated");

  function handleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onSave?.(startup.id);
  }

  function handleCompare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onCompare?.(startup.id);
  }

  return (
    // The link is a stretched overlay, never a wrapper: an anchor that wraps
    // the card cannot hold the action buttons without nesting interactives.
    <div className="cr-startup-card" data-on={anyOn ? "" : undefined}>
      <style>{CARD_CSS}</style>
      <Link
        href={`/startups/${startup.slug}`}
        aria-label={startup.name}
        className="cr-startup-card__link"
      />

      <div className="cr-startup-card__head">
        <EntityLogo name={startup.name} logoUrl={startup.logo_url} logoColor={startup.logo_color} size={40} />
        <div className="cr-startup-card__id">
          <p className="cr-startup-card__name">
            <span>{startup.name}</span>
            {startup.is_demo && <DemoBadge />}
          </p>
          {startup.tagline && <p className="cr-startup-card__tagline">{startup.tagline}</p>}
        </div>
        {hasActions && (
          <div className="cr-startup-card__rail">
            {onCompare && (
              <button
                type="button"
                onClick={handleCompare}
                className="cr-startup-card__act"
                aria-pressed={!!isComparing}
                aria-label={t("startups.compare")}
              >
                <GitCompareArrows size={16} aria-hidden="true" />
              </button>
            )}
            {onSave && (
              <button
                type="button"
                onClick={handleSave}
                className="cr-startup-card__act"
                aria-pressed={!!isSaved}
                aria-label={t("startup.saveWatchlist")}
              >
                <Bookmark size={16} aria-hidden="true" fill={isSaved ? "currentColor" : "none"} />
              </button>
            )}
          </div>
        )}
      </div>

      <p className="cr-startup-card__meta">{metaBits.join(" · ")}</p>

      <div className="cr-startup-card__foot">
        <span className="cr-startup-card__figure">
          {isValidFundingTarget(startup.funding_target)
            ? formatCurrency(startup.funding_target, true)
            : <span className="cr-startup-card__absent">{notStated === "common.ledger.notStated" ? "Not stated" : notStated}</span>}
        </span>
        {scoreVisible && (
          <span className="cr-startup-card__score" title={t("startup.scoreTitle", { score: score as number })}>
            <span className="cr-startup-card__score-label">{t("listings.score")}</span>
            <span className="cr-startup-card__figure">{score}</span>
          </span>
        )}
      </div>
    </div>
  );
}
