"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bookmark, LayoutGrid, List, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { formatCurrency, STAGE_LABELS } from "@/lib/utils";
import { isValidFundingTarget } from "@/lib/validators";
import { computeMatchScore, type InvestorThesis } from "@/lib/match-score";
import { notify } from "@/components/ui/toast-notify";
import { announce } from "@/lib/announce";
import { normalizeCountry } from "@/lib/countries";
import { matchesSavedSearch } from "@/lib/search-match";
import { displayLocale } from "@/lib/display-locale";
import { useTranslation } from "@/hooks/useTranslation";
import { InfoTip } from "@/components/shared/info-tip";
import { EntityLogo } from "@/components/shared/entity-logo";
import { DemoBadge } from "@/components/shared/demo-badge";
import { ScoreCaption } from "@/components/review/ScoreWithDisclaimer";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/page-header";
import { Ledger, LedgerCell, LedgerHead, LedgerRow } from "@/components/ui/ledger";
import {
  FilterBar,
  FilterMenu,
  FilterPopover,
  FilterSearch,
  SortSelect,
  type FilterOption,
  type SortOption,
} from "@/components/ui/filter-bar";
import { StartupCard, startupMetaBits, type StartupCardData } from "@/components/startup/startup-card";
// The canonical sector list: a local copy once drifted and left live sectors
// unfilterable.
import { INDUSTRIES } from "@/types";

/* Hallmark · genre: modern-minimal · surface: /startups ledger
 * Built on components/ui/{page-header,filter-bar,ledger,EmptyState}. Colours
 * are tokens only; spacing is rem on the 4/8/12/16/24/32/48/64 steps.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const STAGE_ORDER = ["pre-seed", "seed", "series_a", "series_b_plus"];
const MRR_STEPS = [5_000, 25_000, 100_000];
const RAISING_STEPS = [1_000_000, 2_000_000];
const SCORE_STEPS = [60, 80];
const RUNWAY_STEP = 12;
const GROWTH_STEP = 20;
const PAGE_SIZE = 24;
/** The filter bar sticks only when the list is longer than 12 rows. */
const STICKY_ABOVE_ROWS = 12;
/** A derived match below this is noise, not a signal. */
const MATCH_FLOOR = 40;
const UNDO_MS = 8000;

/** The one page column, shared with the loading skeleton so the swap does not move. */
const FRAME: CSSProperties = {
  maxWidth: "68.75rem",
  marginInline: "auto",
  paddingInline: "clamp(1.5rem, 5vw, 2rem)",
  paddingBlockEnd: "4rem",
};

// Figure tracks are fixed: every row is its own grid, so an auto track would
// size per row and the columns would not line up.
const COL_COMPANY = "minmax(0,1.5fr)";
const COL_META = "minmax(0,1fr)";
const COL_FIGURE = "6.5rem";
const COL_SAVE = "2.75rem";
const COL_UNHIDE = "5.5rem";

const FOOTNOTE_TEXT: CSSProperties = {
  fontFamily: "inherit",
  fontSize: "inherit",
  lineHeight: "inherit",
  color: "inherit",
  maxWidth: "none",
};

const LANE_CSS = `
.cr-su-company { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
.cr-su-company__text { flex: 1 1 auto; min-width: 0; align-self: baseline; }
.cr-su-logo { display: inline-flex; flex: none; }
.cr-su-logo > span { border-color: transparent !important; }
.cr-su-name { display: flex; align-items: baseline; gap: 0.5rem; min-width: 0; }
.cr-su-name > .cr-row-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cr-su-name > .cr-row-title[data-viewed] { color: var(--cr-ink-3); }
.cr-su-match { font-weight: 500; color: var(--cr-ink); }
.cr-su-score-label {
  margin-inline-end: 0.5rem;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem;
  font-weight: 400;
  color: var(--cr-ink-3);
}
.cr-su-tip { text-transform: none; letter-spacing: 0; white-space: normal; }
.cr-su-icon-btn { min-width: 2.75rem; padding-inline: 0; }
.cr-su-bookmark svg { color: var(--cr-ink-3); transition: color 120ms var(--ease-out); }
@media (hover: hover) { .cr-su-bookmark:hover svg { color: var(--cr-ink); } }
.cr-su-bookmark[data-saved] svg,
.cr-su-bookmark[data-saved]:hover svg { color: var(--cr-copper); }
.cr-su-text-action { margin-inline-start: -0.5rem; }
@media (min-width: 768px) { .cr-su-score-label { display: none; } }
@media (max-width: 767px) { .cr-su-indent { display: block; padding-inline-start: 2.75rem; } }

.cr-su-upsell {
  margin: 0 0 0.75rem;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.4;
  color: var(--cr-ink-2);
}
.cr-su-upsell .cr-link { display: inline-block; padding-block: 0.75rem; margin-block: -0.75rem; }

.cr-su-saved-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; min-width: 0; }
@media (min-width: 640px) { .cr-su-saved-actions { margin-block: -0.325rem; } }
.cr-su-saveform { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; min-width: 0; }
.cr-su-saveform .cr-input { width: 14rem; max-width: 100%; }
@media (max-width: 639px) { .cr-su-saveform .cr-input { flex: 1 1 10rem; width: auto; } }
.cr-su-saveform__error {
  flex-basis: 100%;
  margin: 0;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--cr-down);
}

.cr-su-saved { display: flex; flex-direction: column; min-width: min(18rem, calc(100vw - 4rem)); }
.cr-su-saved__row { display: flex; align-items: center; gap: 0.25rem; min-width: 0; }
.cr-su-saved__apply {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  border: 0;
  background-color: transparent;
  text-align: start;
  font: inherit;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem;
}
.cr-su-saved__apply:focus-visible { outline: 2px solid var(--cr-copper) !important; outline-offset: -2px; box-shadow: none !important; }
.cr-su-saved__name { font-weight: 600; color: var(--cr-ink); }
.cr-su-saved__summary { color: var(--cr-ink-3); }
.cr-su-saved__removed {
  flex: 1 1 auto;
  min-width: 0;
  padding-inline: 0.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--cr-ink-2);
}
.cr-su-saved__note {
  margin: 0.25rem 0 0;
  padding: 0.5rem 0.75rem;
  border-block-start: 1px solid var(--cr-rule);
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.4;
  color: var(--cr-ink-3);
}

.cr-su-subgroup { min-width: 0; }
.cr-su-subgroup + .cr-su-subgroup { margin-block-start: 0.25rem; padding-block-start: 0.25rem; border-block-start: 1px solid var(--cr-rule); }
.cr-su-subgroup__label {
  margin: 0;
  padding: 0.5rem 0.75rem 0.25rem;
  font-family: var(--font-dm-sans), system-ui, sans-serif;
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.4;
  color: var(--cr-ink-3);
}

.cr-su-skel { display: inline-block; vertical-align: middle; border-radius: var(--cr-radius-control); background-color: var(--cr-paper-3); }
.cr-su-skel--logo { flex: none; width: 2rem; height: 2rem; }
.cr-su-skel-line { display: flex; align-items: center; min-width: 0; }
.cr-su-skel-line--title { height: 1.3125rem; }
.cr-su-skel-line--sub { height: 1.1375rem; }

@media (prefers-reduced-motion: reduce) { .cr-su-bookmark svg { transition: none; } }

/* View toggle: list (the separated ledger, below) vs. a card grid. Sits flush
   right, just above the results, so it reads as acting on the list beneath
   it rather than as another filter. Icon-only buttons never wrap to a second
   line at any width. */
.cr-su-viewrow { display: flex; justify-content: flex-end; margin-block-end: 1rem; }
.cr-su-viewtoggle { display: inline-flex; border: 1px solid var(--cr-rule-dark); border-radius: var(--cr-radius-control); overflow: hidden; }
.cr-su-viewtoggle__btn {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: 0;
  background-color: transparent;
  color: var(--cr-ink-3);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 120ms var(--ease-out), color 120ms var(--ease-out);
}
.cr-su-viewtoggle__btn + .cr-su-viewtoggle__btn { border-inline-start: 1px solid var(--cr-rule-dark); }
.cr-su-viewtoggle__btn[aria-pressed="true"] { color: var(--cr-ink); background-color: var(--cr-paper-3); }
@media (hover: hover) {
  .cr-su-viewtoggle__btn:not([aria-pressed="true"]):hover { background-color: var(--cr-paper-2); color: var(--cr-ink); }
}
.cr-su-viewtoggle__btn:focus-visible { outline: 2px solid var(--cr-copper) !important; outline-offset: -2px; box-shadow: none !important; }

/* Card grid: one track on a phone, growing with the viewport. Every track is
   minmax(0,1fr) rather than a bare 1fr, so a card's content (the logo, the
   name) can never force the row wider than the viewport. */
.cr-su-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0,1fr); gap: 1rem; transition: opacity 150ms var(--ease-out); }
.cr-su-grid[aria-busy="true"] { opacity: 0.6; }
@media (min-width: 640px) { .cr-su-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
@media (min-width: 1024px) { .cr-su-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }

@media (prefers-reduced-motion: reduce) {
  .cr-su-viewtoggle__btn, .cr-su-grid { transition: none; }
}
`;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * What the server resolved about the viewer. Plan gates are decided on the
 * server (lib/access investorCan); the client only renders what they allow.
 */
export interface DirectoryViewer {
  role: "investor" | "startup" | "admin" | null;
  /** Gated financial fields are already stripped server-side when false. */
  canSeeFinancials: boolean;
  canSeeScore: boolean;
  savedSearches: boolean;
  advancedFilters: boolean;
  dataExport: boolean;
}

const ANONYMOUS_VIEWER: DirectoryViewer = {
  role: null,
  canSeeFinancials: false,
  canSeeScore: false,
  savedSearches: false,
  advancedFilters: false,
  dataExport: false,
};

interface Startup {
  id: string; slug: string; name: string; tagline: string;
  industry: string; stage: string; funding_target: number;
  mrr: number | null; arr: number | null; growth_rate: number | null;
  runway_months: number | null; created_at: string; updated_at: string;
  vaultrise_score: number | null;
  country: string | null; business_model: string | null; round_close_date: string | null;
  demo_video_url: string | null; founded_year: number | null; verified_at: string | null;
  round_state?: string | null;
  logo_url?: string | null;
  logo_color?: string | null;
  is_demo?: boolean;
}

/**
 * Every key the saved-search matcher and the alert cron understand stays in
 * the state, including the ones this page no longer offers as a first-class
 * control, so an old link or saved search still filters (and shows) exactly
 * what it did.
 */
interface Filters {
  query: string; industries: string[]; stages: string[];
  mrrMin: number; aiScoreMin: number; sort: string; country: string;
  newOnly: boolean; raisingMin: number; runwayMin: number; growthMin: number;
  closingSoon: boolean; businessModel: string; hasDemo: boolean;
}

const DEFAULT_FILTERS: Filters = {
  query: "", industries: [], stages: [],
  mrrMin: 0, aiScoreMin: 0, sort: "recent", country: "",
  newOnly: false, raisingMin: 0, runwayMin: 0, growthMin: 0,
  closingSoon: false, businessModel: "", hasDemo: false,
};

interface SavedSearch { id: string; name: string; filters: Record<string, unknown> | null }

type Vars = Record<string, string | number>;
type TFn = (key: string, vars?: Vars) => string;
type TfFn = (key: string, fallback: string, vars?: Vars, fallbackOne?: string) => string;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** t() with an English fallback until the key lands in messages/. */
function useTf() {
  const { t } = useTranslation();
  const tf = useCallback<TfFn>(
    (key, fallback, vars, fallbackOne) => {
      const out = t(key, vars);
      if (out !== key) return out;
      const base = fallbackOne !== undefined && vars?.count === 1 ? fallbackOne : fallback;
      return vars ? base.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : base;
    },
    [t],
  );
  return { t: t as TFn, tf };
}

function advancedCount(f: Filters): number {
  return (f.mrrMin > 0 ? 1 : 0) + (f.raisingMin > 0 ? 1 : 0) + (f.aiScoreMin > 0 ? 1 : 0)
    + (f.runwayMin > 0 ? 1 : 0) + (f.growthMin > 0 ? 1 : 0)
    + (f.newOnly ? 1 : 0) + (f.closingSoon ? 1 : 0) + (f.hasDemo ? 1 : 0);
}

function positive(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function readFilters(raw: Record<string, unknown> | null | undefined): Filters {
  const r = raw ?? {};
  return {
    query: text(r.query),
    industries: strings(r.industries),
    stages: strings(r.stages),
    mrrMin: positive(r.mrrMin),
    aiScoreMin: positive(r.aiScoreMin),
    sort: text(r.sort) || DEFAULT_FILTERS.sort,
    country: text(r.country),
    newOnly: r.newOnly === true,
    raisingMin: positive(r.raisingMin),
    runwayMin: positive(r.runwayMin),
    growthMin: positive(r.growthMin),
    closingSoon: r.closingSoon === true,
    businessModel: text(r.businessModel),
    hasDemo: r.hasDemo === true,
  };
}

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, " ");
}

function money(n: number): string {
  return formatCurrency(n, true);
}

/** A threshold is worth offering only when it splits the loaded rows: some at or above it, some below. */
function splits(values: number[], threshold: number): boolean {
  let above = 0;
  for (const v of values) if (v >= threshold) above += 1;
  return above > 0 && above < values.length;
}

function stepsThatSplit(values: number[], steps: number[], selected: number): number[] {
  const out = steps.filter((step) => splits(values, step));
  if (selected > 0 && !out.includes(selected)) out.push(selected);
  return out.sort((a, b) => a - b);
}

function joinList(items: string[]): string {
  try {
    return new Intl.ListFormat(displayLocale(), { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}

function optionsFrom(order: string[], counts: Record<string, number>, selected: string[], label: (v: string) => string): FilterOption[] {
  const seen = new Set(order);
  const extra: string[] = [];
  for (const v of [...Object.keys(counts), ...selected]) {
    if (!seen.has(v)) { seen.add(v); extra.push(v); }
  }
  return [...order, ...extra.sort()].map((v) => ({ value: v, label: label(v), count: counts[v] ?? 0 }));
}

/** Mirrors FilterMenu's own render rule, so the bar knows whether it has any controls. */
function menuRenders(options: ReadonlyArray<FilterOption>, selected: ReadonlyArray<string>): boolean {
  const visible = options.filter((o) => o.count !== 0 || selected.includes(o.value));
  return visible.length >= 2 || selected.length > 0;
}

function advancedParts(f: Filters, t: TFn, tf: TfFn): string[] {
  const threshold = (label: string, value: string) => tf("startups.ledger.threshold", "{label} {value}+", { label, value });
  const parts: string[] = [];
  if (f.mrrMin > 0) parts.push(threshold(t("listings.mrr"), money(f.mrrMin)));
  if (f.raisingMin > 0) parts.push(threshold(t("listings.raising"), money(f.raisingMin)));
  if (f.aiScoreMin > 0) parts.push(threshold(t("listings.score"), String(f.aiScoreMin)));
  if (f.runwayMin > 0) parts.push(f.runwayMin === RUNWAY_STEP ? t("startups.runway12") : threshold(t("startups.runwayLabel"), String(f.runwayMin)));
  if (f.growthMin > 0) parts.push(f.growthMin === GROWTH_STEP ? t("startups.growth20") : threshold(t("startupDetail.growth"), `${f.growthMin}%`));
  if (f.newOnly) parts.push(t("startups.newThisWeek"));
  if (f.closingSoon) parts.push(t("startups.closingSoon"));
  if (f.hasDemo) parts.push(t("startups.hasDemo"));
  return parts;
}

function describeFilters(f: Filters, t: TFn, tf: TfFn): string[] {
  const parts: string[] = [];
  const q = f.query.trim();
  if (q) parts.push(`“${q}”`);
  parts.push(...f.industries, ...f.stages.map(stageLabel));
  if (f.country) parts.push(f.country);
  if (f.businessModel) parts.push(f.businessModel);
  parts.push(...advancedParts(f, t, tf));
  return parts;
}

function insertAt(list: SavedSearch[], item: SavedSearch, index: number): SavedSearch[] {
  if (list.some((s) => s.id === item.id)) return list;
  const next = [...list];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
  return next;
}

// ── More-menu groups ──────────────────────────────────────────────────────────

function ThresholdGroup({ label, steps, value, format, onChange }: {
  label: string;
  steps: number[];
  value: number;
  format: (step: number) => string;
  onChange: (next: number) => void;
}) {
  const { tf } = useTf();
  const labelId = useId();
  // Unique per instance: the bar and the sheet both render this group.
  const name = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="cr-su-subgroup">
      <p id={labelId} className="cr-su-subgroup__label">{label}</p>
      <label className="cr-option">
        <input type="radio" name={name} checked={value <= 0} onChange={() => onChange(0)} />
        <span className="cr-option__label">{tf("common.ledger.any", "Any")}</span>
      </label>
      {steps.map((step) => (
        <label key={step} className="cr-option">
          <input type="radio" name={name} value={String(step)} checked={value === step} onChange={() => onChange(step)} />
          <span className="cr-option__label">{format(step)}</span>
        </label>
      ))}
    </div>
  );
}

function ToggleGroup({ label, options }: {
  label: string;
  options: Array<{ key: string; label: string; on: boolean; set: (on: boolean) => void }>;
}) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="cr-su-subgroup">
      <p id={labelId} className="cr-su-subgroup__label">{label}</p>
      {options.map((o) => (
        <label key={o.key} className="cr-option">
          <input type="checkbox" checked={o.on} onChange={(e) => o.set(e.target.checked)} />
          <span className="cr-option__label">{o.label}</span>
        </label>
      ))}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonBar({ width, height }: { width: string; height: string }) {
  return <span className="cr-su-skel" style={{ width, height }} />;
}

/** Rows at the real row geometry: a 32px logo beside a 15px name and a 13px line, one hairline each. Static, no pulse. */
function LedgerSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul
      className="cr-ledger"
      aria-hidden="true"
      style={{ "--cr-ledger-cols": `${COL_COMPANY} ${COL_META} ${COL_FIGURE}` } as CSSProperties}
    >
      <li className="cr-colhead">
        <div className="cr-cell"><SkeletonBar width="4rem" height="0.5rem" /></div>
        <div className="cr-cell"><SkeletonBar width="5rem" height="0.5rem" /></div>
        <div className="cr-cell cr-cell--figure"><SkeletonBar width="3.5rem" height="0.5rem" /></div>
      </li>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="cr-row" style={{ alignItems: "start" }}>
          <div className="cr-cell cr-cell--primary">
            <span className="cr-su-company">
              <span className="cr-su-skel cr-su-skel--logo" />
              <span className="cr-su-company__text">
                <span className="cr-su-skel-line cr-su-skel-line--title"><SkeletonBar width="min(10rem, 70%)" height="0.75rem" /></span>
                <span className="cr-su-skel-line cr-su-skel-line--sub"><SkeletonBar width="min(16rem, 90%)" height="0.625rem" /></span>
              </span>
            </span>
          </div>
          <div className="cr-cell">
            <span className="cr-su-skel-line cr-su-skel-line--sub cr-su-indent"><SkeletonBar width="8rem" height="0.625rem" /></span>
          </div>
          <div className="cr-cell cr-cell--figure">
            <span className="cr-su-skel-line cr-su-skel-line--title" style={{ justifyContent: "flex-end" }}><SkeletonBar width="3.5rem" height="0.75rem" /></span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The directory before its data: page header, the 44px bar and six rows, in
 * the same frame and classes as the live page. Used by app/startups/loading.tsx
 * and the page's Suspense fallback.
 */
export function StartupsDirectorySkeleton() {
  return (
    <div style={FRAME} aria-hidden="true">
      <style>{LANE_CSS}</style>
      <div className="cr-page-header">
        <div className="cr-page-header__main">
          <span className="cr-su-skel-line" style={{ height: "2.1rem" }}><SkeletonBar width="7rem" height="1.25rem" /></span>
          <div className="cr-page-meta"><SkeletonBar width="7rem" height="0.75rem" /></div>
        </div>
      </div>
      <div className="cr-filterbar">
        <div className="cr-filterbar__row">
          <span className="cr-su-skel" style={{ flex: "1 1 auto", height: "2.75rem" }} />
        </div>
      </div>
      <LedgerSkeleton />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function StartupsSearch({
  initialStartups,
  initialIsPartial,
  marketTotal = 0,
  viewer = ANONYMOUS_VIEWER,
}: {
  initialStartups?: Startup[];
  initialIsPartial?: boolean;
  marketTotal?: number;
  viewer?: DirectoryViewer;
} = {}) {
  const { t, tf } = useTf();
  const searchParams = useSearchParams();
  const isInvestor = viewer.role === "investor";
  const canSaveSearches = isInvestor && viewer.savedSearches;

  // A plan without advanced filters (or without the score) cannot hold those
  // filters through a URL or a saved search: they would narrow the list with no
  // control on screen to show or remove them.
  const fitToViewer = useCallback((f: Filters): Filters => {
    let next = f;
    if (!viewer.advancedFilters) {
      next = { ...next, mrrMin: 0, aiScoreMin: 0, raisingMin: 0, runwayMin: 0, growthMin: 0, newOnly: false, closingSoon: false, hasDemo: false };
    }
    if (!viewer.canSeeScore) next = { ...next, aiScoreMin: 0 };
    return next;
  }, [viewer.advancedFilters, viewer.canSeeScore]);

  // The filter set lives in the address bar, so a filtered view can be shared,
  // bookmarked and revisited with back/forward.
  const [filters, setFilters] = useState<Filters>(() => {
    const p = searchParams;
    const country = p.get("country") ?? "";
    return fitToViewer({
      ...DEFAULT_FILTERS,
      query: p.get("q") ?? "",
      industries: p.get("industries")?.split(",").filter(Boolean) ?? [],
      stages: p.get("stages")?.split(",").filter(Boolean) ?? [],
      mrrMin: positive(p.get("mrr")),
      aiScoreMin: positive(p.get("score")),
      country: country ? normalizeCountry(country) || country : "",
      newOnly: p.get("new") === "1",
      raisingMin: positive(p.get("raising")),
      runwayMin: positive(p.get("runway")),
      growthMin: positive(p.get("growth")),
      closingSoon: p.get("closing") === "1",
      businessModel: p.get("bmodel") ?? "",
      hasDemo: p.get("demo") === "1",
      sort: p.get("sort") ?? DEFAULT_FILTERS.sort,
    });
  });

  // Server-rendered rows arrive as initialStartups, so the first paint is the
  // finished directory; the client fetch runs only when nothing was provided
  // or the server sent a partial first page.
  const [allStartups, setAllStartups] = useState<Startup[]>(initialStartups ?? []);
  // The true market size. The loaded set is a window of it: load more pages
  // deeper, and a text query searches the whole market server-side.
  const [serverTotal, setServerTotal] = useState<number>(marketTotal);
  const [loading, setLoading] = useState(!initialStartups);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  // Existing "not for me" dismissals stay honoured; this page offers no new
  // hides, only the way back through "Hidden (n)".
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [myThesis, setMyThesis] = useState<InvestorThesis | null>(null);
  const myInvestorId = useRef<string | null>(null);
  const supabase = useRef(createClient()).current;
  const searchRef = useRef<HTMLInputElement>(null);

  // Grid default: with the live pool at 2-3 listings, a few bordered cards
  // read as a small curated set; the same rows as a table read as a mostly
  // empty spreadsheet. The list (the separated ledger) is one tap away and
  // remembered per browser, same convention as the deals board's view
  // toggle (localStorage, no URL state -- a display preference, not a filter
  // worth sharing in a link). Server and client must agree on the very first
  // render, so the stored choice is applied after mount, not in the
  // initializer.
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cr-startups-view");
      if (saved === "grid" || saved === "list") setViewMode(saved);
    } catch { /* private mode */ }
  }, []);
  function chooseView(next: "grid" | "list") {
    setViewMode(next);
    try { localStorage.setItem("cr-startups-view", next); } catch { /* private mode */ }
  }

  const mergeRows = useCallback((rows: Startup[]) => {
    setAllStartups((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const fresh = rows.filter((r) => !seen.has(r.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  useEffect(() => {
    async function load() {
      if (initialStartups && !initialIsPartial) return;
      if (initialStartups && initialIsPartial) {
        fetch("/api/startups/list")
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => { if (j?.startups) { setAllStartups(j.startups as Startup[]); if (j.total) setServerTotal(j.total); } })
          .catch(() => {});
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/startups/list");
        const json = await res.json();
        if (!res.ok) throw new Error();
        setLoadError(false);
        setAllStartups((json.startups as Startup[]) ?? []);
        if (json.total) setServerTotal(json.total);
      } catch {
        // A failed fetch must not render as "no listings exist".
        setLoadError(true);
        setAllStartups([]);
      }
      setLoading(false);
    }
    load();
    // RLS scopes each of these reads to the signed-in investor; founders and
    // anonymous sessions get empty sets.
    supabase.from("startup_views").select("startup_id").limit(1000)
      .then(({ data }) => { if (data) setViewedIds(new Set(data.map((v) => v.startup_id))); });
    supabase.from("watchlists").select("startup_id").limit(1000)
      .then(({ data }) => { if (data) setSavedIds(new Set(data.map((w) => w.startup_id))); });
    // A snoozed dismissal whose date has passed no longer hides the listing.
    supabase.from("startup_dismissals").select("startup_id, snooze_until").limit(1000)
      .then(({ data }) => {
        if (!data) return;
        const today = new Date().toISOString().slice(0, 10);
        setDismissedIds(new Set(data.filter((v) => !v.snooze_until || v.snooze_until > today).map((v) => v.startup_id)));
      });
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: inv } = await supabase
        .from("investors")
        .select("id, stages, industries, geography, min_check, max_check")
        .eq("owner_id", user.id)
        .maybeSingle();
      myInvestorId.current = inv?.id ?? null;
      if (inv) setMyThesis({ stages: inv.stages, industries: inv.industries, geography: inv.geography, min_check: inv.min_check, max_check: inv.max_check });
    })();
    // Mount-only: the server payload and the viewer's own rows are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "/" focuses search from anywhere on the page, unless already typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The local filter only sees the loaded window, so a query also asks the
  // server and merges its hits in. Local filtering is instant; only this
  // network call waits, 150ms at most.
  const queryForServer = filters.query.trim();
  useEffect(() => {
    if (queryForServer.length < 2) return;
    if (serverTotal > 0 && allStartups.length >= serverTotal) return;
    const ctl = new AbortController();
    const id = window.setTimeout(() => {
      setSearching(true);
      fetch(`/api/startups/list?q=${encodeURIComponent(queryForServer)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (j?.startups?.length) mergeRows(j.startups as Startup[]); })
        .catch(() => {})
        .finally(() => { if (!ctl.signal.aborted) setSearching(false); });
    }, 150);
    return () => { ctl.abort(); window.clearTimeout(id); setSearching(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryForServer]);

  async function loadMoreRows() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/startups/list?offset=${allStartups.length}`);
      const j = await r.json();
      if (r.ok && j?.startups) { mergeRows(j.startups as Startup[]); if (j.total) setServerTotal(j.total); }
    } catch { /* the button stays; retry is one press away */ }
    setLoadingMore(false);
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const pool = useMemo(
    () => allStartups.filter((s) => (showHidden ? dismissedIds.has(s.id) : !dismissedIds.has(s.id))),
    [allStartups, dismissedIds, showHidden],
  );

  // Rows per option in the loaded, unfiltered set: an option with no rows is
  // hidden rather than offered as a route to an empty list.
  const facets = useMemo(() => {
    const industry: Record<string, number> = {};
    const stage: Record<string, number> = {};
    const country: Record<string, number> = {};
    const model: Record<string, number> = {};
    for (const s of pool) {
      industry[s.industry] = (industry[s.industry] ?? 0) + 1;
      stage[s.stage] = (stage[s.stage] ?? 0) + 1;
      const c = normalizeCountry(s.country);
      if (c) country[c] = (country[c] ?? 0) + 1;
      if (s.business_model) model[s.business_model] = (model[s.business_model] ?? 0) + 1;
    }
    return { industry, stage, country, model };
  }, [pool]);

  const industryOptions = useMemo(
    () => optionsFrom([...INDUSTRIES], facets.industry, filters.industries, (v) => v),
    [facets.industry, filters.industries],
  );
  const stageOptions = useMemo(
    () => optionsFrom(STAGE_ORDER, facets.stage, filters.stages, stageLabel),
    [facets.stage, filters.stages],
  );
  const regionOptions = useMemo(
    () => optionsFrom([], facets.country, filters.country ? [filters.country] : [], (v) => v),
    [facets.country, filters.country],
  );
  const modelOptions = useMemo(
    () => optionsFrom([], facets.model, filters.businessModel ? [filters.businessModel] : [], (v) => v),
    [facets.model, filters.businessModel],
  );

  // Advanced thresholds render only where the loaded range spans them. Gated
  // financials arrive as null for plans without them, so those groups vanish
  // on their own rather than offering filters that match nothing.
  const advanced = useMemo(() => ({
    mrr: stepsThatSplit(pool.map((s) => s.mrr ?? 0), MRR_STEPS, filters.mrrMin),
    raising: stepsThatSplit(pool.map((s) => (isValidFundingTarget(s.funding_target) ? s.funding_target : 0)), RAISING_STEPS, filters.raisingMin),
    score: viewer.canSeeScore ? stepsThatSplit(pool.map((s) => s.vaultrise_score ?? 0), SCORE_STEPS, filters.aiScoreMin) : [],
    runway: splits(pool.map((s) => s.runway_months ?? 0), RUNWAY_STEP) || filters.runwayMin > 0,
    growth: splits(pool.map((s) => s.growth_rate ?? 0), GROWTH_STEP) || filters.growthMin > 0,
  }), [pool, filters.mrrMin, filters.raisingMin, filters.aiScoreMin, filters.runwayMin, filters.growthMin, viewer.canSeeScore]);

  const today = new Date().toISOString().slice(0, 10);
  const anyCloseDate = pool.some((s) => !!s.round_close_date && s.round_close_date.slice(0, 10) >= today);

  const matchById = useMemo(() => {
    const m = new Map<string, number>();
    if (myThesis) for (const s of allStartups) m.set(s.id, computeMatchScore(myThesis, s).score);
    return m;
  }, [myThesis, allStartups]);

  // Only orderings the loaded data can answer: closing needs a future close
  // date, best match needs the viewer's thesis.
  const sortOptions: SortOption[] = [
    { value: "recent", label: t("filters.sortRecent") },
    { value: "funding", label: t("filters.sortRaising") },
    ...(anyCloseDate ? [{ value: "closing", label: t("filters.sortClosing") }] : []),
    ...(myThesis ? [{ value: "fit", label: t("filters.bestMatch") }] : []),
  ];
  const sort = sortOptions.some((o) => o.value === filters.sort) ? filters.sort : "recent";

  const filtered = useMemo(() => {
    const rows = pool.filter((s) => {
      // One matcher for browse and the saved-search alert cron (lib/search-match),
      // so an alert fires if and only if this page would show the listing.
      if (!matchesSavedSearch(filters, s)) return false;
      if (filters.newOnly && (Date.now() - new Date(s.created_at).getTime()) / 86_400_000 > 7) return false;
      return true;
    });
    const newest = (a: Startup, b: Startup) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    switch (sort) {
      case "funding": {
        const ask = (s: Startup) => (isValidFundingTarget(s.funding_target) ? s.funding_target : -1);
        return rows.sort((a, b) => ask(b) - ask(a) || newest(a, b));
      }
      case "closing": {
        const due = (s: Startup) => (s.round_close_date && s.round_close_date.slice(0, 10) >= today ? new Date(s.round_close_date).getTime() : Infinity);
        return rows.sort((a, b) => {
          const d = due(a) - due(b);
          return Number.isNaN(d) || d === 0 ? newest(a, b) : d;
        });
      }
      case "fit":
        return rows.sort((a, b) => (matchById.get(b.id) ?? 0) - (matchById.get(a.id) ?? 0) || newest(a, b));
      default:
        return rows.sort(newest);
    }
  }, [pool, filters, sort, matchById, today]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;
  const canFetchMore = !showHidden && allStartups.length < serverTotal;
  const activeCount = filters.industries.length + filters.stages.length
    + (filters.country ? 1 : 0) + (filters.businessModel ? 1 : 0) + advancedCount(filters);
  const hasCriteria = activeCount > 0 || filters.query.trim().length > 0;
  const total = serverTotal || allStartups.length;

  // Filtering rewrites the list without a navigation, which is silent to a
  // screen reader. The first render is skipped.
  const hasAnnounced = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!hasAnnounced.current) { hasAnnounced.current = true; return; }
    announce(t("listings.showing", { current: visible.length, total: filtered.length }));
  }, [visible.length, filtered.length, loading, t]);

  const patch = useCallback((delta: Partial<Filters>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...delta }));
  }, []);

  const clearFilters = useCallback(() => {
    setPage(1);
    setFilters((f) => ({ ...DEFAULT_FILTERS, query: f.query, sort: f.sort }));
  }, []);

  // replaceState, not the router: no server round trip and no history spam.
  useEffect(() => {
    const id = setTimeout(() => {
      const p = new URLSearchParams();
      if (filters.query)              p.set("q", filters.query);
      if (filters.industries.length)  p.set("industries", filters.industries.join(","));
      if (filters.stages.length)      p.set("stages", filters.stages.join(","));
      if (filters.mrrMin > 0)         p.set("mrr", String(filters.mrrMin));
      if (filters.aiScoreMin > 0)     p.set("score", String(filters.aiScoreMin));
      if (filters.country)            p.set("country", filters.country);
      if (filters.newOnly)            p.set("new", "1");
      if (filters.raisingMin > 0)     p.set("raising", String(filters.raisingMin));
      if (filters.runwayMin > 0)      p.set("runway", String(filters.runwayMin));
      if (filters.growthMin > 0)      p.set("growth", String(filters.growthMin));
      if (filters.closingSoon)        p.set("closing", "1");
      if (filters.businessModel)      p.set("bmodel", filters.businessModel);
      if (filters.hasDemo)            p.set("demo", "1");
      if (filters.sort !== DEFAULT_FILTERS.sort) p.set("sort", filters.sort);
      const qs = p.toString();
      const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      if (next !== window.location.pathname + window.location.search) {
        window.history.replaceState(window.history.state, "", next);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [filters]);

  // ── Row actions ─────────────────────────────────────────────────────────────

  async function toggleSave(id: string) {
    const wasSaved = savedIds.has(id);
    const flip = (on: boolean) => setSavedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
    // Optimistic and silent on success: the bookmark fill is the confirmation.
    // Through the API, so the plan's watchlist cap and the founder's "saved"
    // notification apply here as on the detail page.
    flip(!wasSaved);
    let res: Response;
    try {
      res = await fetch("/api/watchlist", {
        method: wasSaved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startupId: id }),
      });
    } catch {
      flip(wasSaved);
      notify.error(t("errors.generic"));
      return;
    }
    if (!res.ok) {
      flip(wasSaved);
      if (res.status === 401) { notify.info(t("startups.saveNeedsAccount")); return; }
      const data = await res.json().catch(() => ({}));
      notify.error(data.error || t("errors.generic"));
    }
  }

  async function unhide(id: string) {
    const inv = myInvestorId.current;
    if (!inv) { notify.error(t("errors.generic")); return; }
    // Leaving the hidden view once it empties, or the page would filter every
    // listing out.
    if (dismissedIds.size <= 1) setShowHidden(false);
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    const { error } = await supabase.from("startup_dismissals").delete().eq("investor_id", inv).eq("startup_id", id);
    if (error) {
      setDismissedIds((prev) => new Set(prev).add(id));
      notify.error(t("errors.generic"));
    }
  }

  function toggleHiddenView() {
    setShowHidden((v) => !v);
    setPage(1);
  }

  function exportCsv() {
    // Neutralise spreadsheet formula injection (=, +, -, @ leading a cell),
    // then quote and double internal quotes.
    const esc = (v: unknown) => {
      const x = String(v ?? "");
      const safe = /^[=+\-@]/.test(x) ? `'${x}` : x;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const header = [
      t("listings.company"),
      tf("startups.ledger.csvTagline", "Tagline"),
      t("listings.industry"),
      t("listings.stage"),
      t("listings.raising"),
      t("listings.mrr"),
      tf("startups.ledger.csvGrowth", "Growth (%)"),
      tf("startups.ledger.csvRunway", "Runway (months)"),
      ...(viewer.canSeeScore ? [t("listings.aiScore")] : []),
      t("filters.country"),
      tf("startups.ledger.csvProfile", "Profile"),
    ];
    const lines = filtered.map((s) => [
      s.name, s.tagline, s.industry, stageLabel(s.stage),
      isValidFundingTarget(s.funding_target) ? s.funding_target : "",
      s.mrr ?? "", s.growth_rate ?? "", s.runway_months ?? "",
      ...(viewer.canSeeScore ? [s.vaultrise_score ?? ""] : []),
      s.country ?? "",
      `${window.location.origin}/startups/${s.slug}`,
    ]);
    const csv = [header, ...lines].map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "startups.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Saved searches ──────────────────────────────────────────────────────────
  // The investor dashboard's saved-search manager moves here: apply, delete
  // (optimistic, with Undo) and saving the current view. The server enforces
  // the plan (a 403 with upgrade: true); the client only renders for investors
  // whose plan carries saved searches.

  const [savedSearches, setSavedSearches] = useState<SavedSearch[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [nameInvalid, setNameInvalid] = useState(false);
  const [savingSearch, setSavingSearch] = useState(false);
  const [removedSearch, setRemovedSearch] = useState<{ search: SavedSearch; index: number } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const saveSearchButtonRef = useRef<HTMLButtonElement>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusToSave = useRef(false);
  const pendingDelete = useRef<Promise<Response | null> | null>(null);
  const nameErrorId = useId();

  useEffect(() => {
    if (!canSaveSearches) return;
    let live = true;
    fetch("/api/saved-searches")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setSavedSearches(Array.isArray(j?.searches) ? (j.searches as SavedSearch[]) : null); })
      .catch(() => { if (live) setSavedSearches(null); });
    return () => { live = false; };
  }, [canSaveSearches]);

  useEffect(() => {
    if (naming) {
      nameInputRef.current?.focus();
    } else if (returnFocusToSave.current) {
      returnFocusToSave.current = false;
      saveSearchButtonRef.current?.focus();
    }
  }, [naming]);

  // Nothing left to save once the criteria are cleared.
  useEffect(() => {
    if (!hasCriteria && naming) setNaming(false);
  }, [hasCriteria, naming]);

  useEffect(() => {
    if (!removedSearch) return;
    undoButtonRef.current?.focus();
    const id = window.setTimeout(() => setRemovedSearch(null), UNDO_MS);
    return () => window.clearTimeout(id);
  }, [removedSearch]);

  function cancelNaming() {
    returnFocusToSave.current = true;
    setNaming(false);
    setSearchName("");
    setNameInvalid(false);
  }

  async function saveSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (savingSearch) return;
    const trimmed = searchName.trim();
    if (!trimmed) {
      setNameInvalid(true);
      nameInputRef.current?.focus();
      return;
    }
    setSavingSearch(true);
    let res: Response | null = null;
    try {
      res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, filters }),
      });
    } catch {
      res = null;
    }
    const body = res ? await res.json().catch(() => ({})) : {};
    setSavingSearch(false);
    if (!res?.ok || !body?.search) {
      notify.error(body?.upgrade ? t("startups.savedSearchUpgrade") : (body?.error || t("startups.savedSearchFailed")));
      return;
    }
    // The server upserts on (investor, name), so the list replaces rather than duplicates.
    setSavedSearches((prev) => [body.search as SavedSearch, ...(prev ?? []).filter((s) => s.id !== body.search.id)]);
    returnFocusToSave.current = true;
    setNaming(false);
    setSearchName("");
  }

  function applySaved(search: SavedSearch) {
    setFilters(fitToViewer(readFilters(search.filters)));
    setPage(1);
    setShowHidden(false);
  }

  async function removeSearch(search: SavedSearch, index: number) {
    setSavedSearches((prev) => (prev ?? []).filter((s) => s.id !== search.id));
    setRemovedSearch({ search, index });
    const request = fetch("/api/saved-searches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: search.id }),
    }).catch(() => null);
    pendingDelete.current = request;
    const res = await request;
    if (!res?.ok) {
      setSavedSearches((prev) => insertAt(prev ?? [], search, index));
      setRemovedSearch((cur) => (cur?.search.id === search.id ? null : cur));
      notify.error(t("startups.savedSearchDeleteFailed"));
    }
  }

  async function undoRemove() {
    const removed = removedSearch;
    if (!removed) return;
    setRemovedSearch(null);
    setSavedSearches((prev) => insertAt(prev ?? [], removed.search, removed.index));
    // Re-created only after the delete settles, or the delete would land on the restored row.
    await pendingDelete.current;
    const res = await fetch("/api/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: removed.search.name, filters: removed.search.filters ?? {} }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok || !body?.search) {
      setSavedSearches((prev) => (prev ?? []).filter((s) => s.id !== removed.search.id));
      notify.error(t("startups.savedSearchFailed"));
      return;
    }
    setSavedSearches((prev) => (prev ?? []).map((s) => (s.id === removed.search.id ? (body.search as SavedSearch) : s)));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const notStated = tf("common.ledger.notStated", "Not stated");

  let headerCount: string | null = null;
  if (!loading && !loadError && filtered.length > 0) {
    if (showHidden) {
      headerCount = tf("startups.ledger.hiddenCount", "{count} hidden", { count: filtered.length });
    } else if (!hasCriteria && dismissedIds.size === 0) {
      headerCount = tf("startups.ledger.count", "{count} rounds raising", { count: total }, "{count} round raising");
    } else {
      headerCount = tf("startups.ledger.countOf", "{current} of {count} rounds", { current: filtered.length, count: total }, "{current} of {count} round");
    }
  }

  const showSaveSearch = canSaveSearches && (naming || hasCriteria);
  const showSavedMenu = canSaveSearches && ((savedSearches?.length ?? 0) > 0 || removedSearch !== null);

  const headerEnd = showSaveSearch || showSavedMenu ? (
    <div className="cr-su-saved-actions">
      {showSaveSearch && (naming ? (
        <form className="cr-su-saveform" onSubmit={saveSearch} noValidate>
          <input
            ref={nameInputRef}
            className="cr-input"
            value={searchName}
            maxLength={80}
            readOnly={savingSearch}
            aria-label={tf("startups.ledger.searchName", "Search name")}
            aria-invalid={nameInvalid || undefined}
            aria-describedby={nameInvalid ? nameErrorId : undefined}
            placeholder={t("startups.savedSearchNamePlaceholder")}
            onChange={(e) => { setSearchName(e.target.value); if (nameInvalid) setNameInvalid(false); }}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); cancelNaming(); } }}
          />
          <button type="submit" className="cr-btn" aria-busy={savingSearch || undefined}>
            {t("common.save")}
          </button>
          <button type="button" className="cr-btn cr-btn--text" onClick={cancelNaming}>
            {t("common.cancel")}
          </button>
          {nameInvalid && (
            <p id={nameErrorId} className="cr-su-saveform__error">
              {tf("startups.ledger.nameRequired", "Name the search to save it.")}
            </p>
          )}
        </form>
      ) : (
        <button ref={saveSearchButtonRef} type="button" className="cr-btn cr-btn--text" onClick={() => setNaming(true)}>
          {tf("startups.ledger.saveSearch", "Save search")}
        </button>
      ))}
      {showSavedMenu && (
        <FilterPopover label={t("startups.savedSearches")} align="end">
          {({ close }) => (
            <div className="cr-su-saved">
              {(savedSearches ?? []).map((s, index) => {
                const summary = describeFilters(readFilters(s.filters), t, tf).join(", ");
                return (
                  <div key={s.id} className="cr-su-saved__row">
                    <button
                      type="button"
                      className="cr-option cr-su-saved__apply"
                      onClick={() => { applySaved(s); close(); }}
                    >
                      <span className="cr-option__label">
                        <span className="cr-su-saved__name">{s.name}</span>
                        {summary && <span className="cr-su-saved__summary">{` · ${summary}`}</span>}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="cr-btn cr-btn--text cr-su-icon-btn"
                      aria-label={t("startups.savedSearchDelete", { name: s.name })}
                      onClick={() => void removeSearch(s, index)}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
              {removedSearch && (
                <div className="cr-su-saved__row" role="status">
                  <span className="cr-su-saved__removed">
                    {tf("startups.ledger.searchRemoved", "{name} removed.", { name: removedSearch.search.name })}
                  </span>
                  <button ref={undoButtonRef} type="button" className="cr-btn cr-btn--text" onClick={() => void undoRemove()}>
                    {t("startups.hiddenUndo")}
                  </button>
                </div>
              )}
              {/* Alerts are not a per-search switch: the daily cron checks every saved search. */}
              <p className="cr-su-saved__note">
                {tf("startups.ledger.alertsNote", "New listings that match a saved search reach your notifications once a day.")}
              </p>
            </div>
          )}
        </FilterPopover>
      )}
    </div>
  ) : undefined;

  // ── Filter bar controls ─────────────────────────────────────────────────────

  const moreName = t("filters.more");
  const advancedLabels = advancedParts(filters, t, tf);
  let moreLabel = moreName;
  if (advancedLabels.length > 0) {
    moreLabel = tf("common.ledger.menuSelection", "{label}: {value}", { label: moreName, value: advancedLabels[0] });
    if (advancedLabels.length > 1) {
      moreLabel = `${moreLabel} ${tf("common.ledger.moreSelected", "+{count}", { count: advancedLabels.length - 1 })}`;
    }
  }
  const atLeast = (value: string) => tf("startups.ledger.atLeast", "{value}+", { value });
  const toggleOptions = [
    ...(advanced.runway ? [{ key: "runway", label: t("startups.runway12"), on: filters.runwayMin > 0, set: (on: boolean) => patch({ runwayMin: on ? RUNWAY_STEP : 0 }) }] : []),
    ...(advanced.growth ? [{ key: "growth", label: t("startups.growth20"), on: filters.growthMin > 0, set: (on: boolean) => patch({ growthMin: on ? GROWTH_STEP : 0 }) }] : []),
    // Kept visible only while on, so a link or saved search that sets them can be undone.
    ...(filters.newOnly ? [{ key: "new", label: t("startups.newThisWeek"), on: true, set: (on: boolean) => patch({ newOnly: on }) }] : []),
    ...(filters.closingSoon ? [{ key: "closing", label: t("startups.closingSoon"), on: true, set: (on: boolean) => patch({ closingSoon: on }) }] : []),
    ...(filters.hasDemo ? [{ key: "demo", label: t("startups.hasDemo"), on: true, set: (on: boolean) => patch({ hasDemo: on }) }] : []),
  ];
  const showMore = viewer.advancedFilters
    && (advanced.mrr.length > 0 || advanced.raising.length > 0 || advanced.score.length > 0 || toggleOptions.length > 0);

  const controls: ReactNode[] = [];
  if (menuRenders(industryOptions, filters.industries)) {
    controls.push(
      <FilterMenu key="industry" label={t("startups.industry")} options={industryOptions}
        value={filters.industries} onChange={(next) => patch({ industries: next })} />,
    );
  }
  if (menuRenders(stageOptions, filters.stages)) {
    controls.push(
      <FilterMenu key="stage" label={t("startups.stageGroup")} options={stageOptions}
        value={filters.stages} onChange={(next) => patch({ stages: next })} />,
    );
  }
  if (showMore) {
    controls.push(
      <FilterPopover key="more" label={moreLabel} sheetLabel={moreName} active={advancedLabels.length > 0}>
        <>
          {advanced.mrr.length > 0 && (
            <ThresholdGroup label={t("listings.mrr")} steps={advanced.mrr} value={filters.mrrMin}
              format={(n) => atLeast(money(n))} onChange={(n) => patch({ mrrMin: n })} />
          )}
          {advanced.raising.length > 0 && (
            <ThresholdGroup label={t("listings.raising")} steps={advanced.raising} value={filters.raisingMin}
              format={(n) => atLeast(money(n))} onChange={(n) => patch({ raisingMin: n })} />
          )}
          {advanced.score.length > 0 && (
            <ThresholdGroup label={t("listings.aiScore")} steps={advanced.score} value={filters.aiScoreMin}
              format={(n) => atLeast(String(n))} onChange={(n) => patch({ aiScoreMin: n })} />
          )}
          {toggleOptions.length > 0 && <ToggleGroup label={t("startups.traction")} options={toggleOptions} />}
        </>
      </FilterPopover>,
    );
  }
  const regionSelected = filters.country ? [filters.country] : [];
  if (menuRenders(regionOptions, regionSelected)) {
    controls.push(
      <FilterMenu key="region" multiple={false} label={t("startups.region")} options={regionOptions}
        value={filters.country || null} onChange={(next) => patch({ country: next ?? "" })} />,
    );
  }
  const modelSelected = filters.businessModel ? [filters.businessModel] : [];
  if (menuRenders(modelOptions, modelSelected)) {
    controls.push(
      <FilterMenu key="bmodel" multiple={false} label={t("startups.businessModelGroup")} options={modelOptions}
        value={filters.businessModel || null} onChange={(next) => patch({ businessModel: next ?? "" })} />,
    );
  }

  const showBar = !loadError && (loading || allStartups.length > 0 || hasCriteria);

  // ── List body ───────────────────────────────────────────────────────────────

  const ledgerShown = !loading && !loadError && filtered.length > 0;
  const scoreColumn = ledgerShown && viewer.canSeeScore && pool.some((s) => s.vaultrise_score != null);
  const trailingKind: "save" | "unhide" | null = showHidden ? "unhide" : isInvestor ? "save" : null;
  const columns = [
    COL_COMPANY,
    COL_META,
    COL_FIGURE,
    scoreColumn ? COL_FIGURE : null,
    trailingKind === "save" ? COL_SAVE : trailingKind === "unhide" ? COL_UNHIDE : null,
  ].filter(Boolean).join(" ");
  const showUpsell = isInvestor && ledgerShown && (!viewer.canSeeFinancials || !viewer.canSeeScore);
  // The card grid has no row for the "unhide" action (it is a StartupCard,
  // not a ledger row with a trailing cell) -- showing hidden listings always
  // falls back to the list, which is the one view that can undo a dismissal.
  const effectiveView: "grid" | "list" = trailingKind === "unhide" ? "list" : viewMode;
  // StartupCard gates its score figure on a subscription tier, not the bare
  // boolean this page already resolved server-side; any non-"free" tier
  // reproduces the same scoreColumn decision without teaching the card a
  // second, page-specific way to ask the question.
  const cardTier = scoreColumn ? "pro_investor" : null;

  let body: ReactNode;
  if (loading) {
    body = <LedgerSkeleton />;
  } else if (loadError) {
    body = (
      <EmptyState
        title={t("errorPage.sectionTitle")}
        action={
          <button type="button" className="cr-btn cr-btn--text cr-su-text-action" onClick={() => window.location.reload()}>
            {t("errorPage.retry")}
          </button>
        }
      />
    );
  } else if (allStartups.length === 0) {
    body = <EmptyState title={t("startups.noListings")} />;
  } else if (filtered.length === 0) {
    if (activeCount > 0) {
      body = (
        <EmptyState
          title={tf("startups.ledger.noMatch", "No rounds match {filters}.", { filters: joinList(describeFilters(filters, t, tf)) })}
          action={
            <button type="button" className="cr-btn cr-btn--text cr-su-text-action" onClick={clearFilters}>
              {t("startups.clearFilters")}
            </button>
          }
        />
      );
    } else if (filters.query.trim()) {
      body = (
        <EmptyState
          title={t("startups.noResultsFor", { query: filters.query.trim() })}
          action={
            <button type="button" className="cr-btn cr-btn--text cr-su-text-action" onClick={() => patch({ query: "" })}>
              {tf("common.ledger.clearSearch", "Clear search")}
            </button>
          }
        />
      );
    } else {
      body = (
        <EmptyState
          title={tf("startups.ledger.allHidden", "Every open round is hidden.")}
          action={
            <button type="button" className="cr-btn cr-btn--text cr-su-text-action" onClick={toggleHiddenView}>
              {t("startups.showHidden", { count: dismissedIds.size })}
            </button>
          }
        />
      );
    }
  } else if (effectiveView === "grid") {
    // Same rows as the list, in the same StartupCard already used to browse
    // by sector and on the investor dashboard -- one card component for the
    // app, not a second bespoke one for this toggle. The card carries no
    // "viewed" dimming or match-score badge (it has neither prop): those are
    // secondary signals the list view keeps; the card's job is the separated,
    // specimen-like read the founder asked for, not full parity with the row.
    body = (
      <ul className="cr-su-grid" aria-label={t("nav.startups")} aria-busy={searching || undefined}>
        {visible.map((s) => (
          <li key={s.id}>
            {/* This file's own Startup type keeps `stage` as a bare string (it
                only ever calls .replace() on it); StartupCardData narrows to
                the DB's StartupStage union. Same cast the investor dashboard
                uses for the same mismatch (app/dashboard/investor/page.tsx). */}
            <StartupCard
              startup={s as unknown as StartupCardData}
              investorTier={cardTier}
              isSaved={isInvestor ? savedIds.has(s.id) : undefined}
              onSave={isInvestor ? toggleSave : undefined}
            />
          </li>
        ))}
      </ul>
    );
  } else {
    body = (
      <Ledger
        columns={columns}
        busy={searching}
        aria-label={t("nav.startups")}
        /* Opt-in separated variant (globals.css "Ledger: separated variant"),
           the same class the investor directory uses for the same reason --
           founder wanted directory rows to read as distinct listings rather
           than lines in a table. CSS only, cascades to every LedgerRow below. */
        className="cr-ledger--separated"
        head={
          <LedgerHead
            trailingLabel={trailingKind === "save" ? t("startup.saveWatchlist") : trailingKind === "unhide" ? t("startups.unhide") : undefined}
          >
            <LedgerCell>{t("listings.company")}</LedgerCell>
            <LedgerCell>{tf("startups.ledger.sectorStage", "Sector · Stage")}</LedgerCell>
            <LedgerCell figure>{t("listings.raising")}</LedgerCell>
            {scoreColumn && (
              <LedgerCell figure>
                {t("listings.score")}
                <span className="cr-su-tip"><InfoTip termKey="glossary.aiScore" /></span>
              </LedgerCell>
            )}
          </LedgerHead>
        }
      >
        {visible.map((s) => {
          const viewed = viewedIds.has(s.id);
          const saved = savedIds.has(s.id);
          const match = myThesis ? matchById.get(s.id) : undefined;
          const trailing = trailingKind === "save" ? (
            <button
              type="button"
              className="cr-btn cr-btn--text cr-su-icon-btn cr-su-bookmark"
              data-saved={saved ? "" : undefined}
              aria-label={saved ? t("startup.removeWatchlist") : t("startup.saveWatchlist")}
              onClick={() => void toggleSave(s.id)}
            >
              <Bookmark size={16} aria-hidden="true" fill={saved ? "currentColor" : "none"} />
            </button>
          ) : trailingKind === "unhide" ? (
            <button type="button" className="cr-btn cr-btn--text" onClick={() => void unhide(s.id)}>
              {t("startups.unhide")}
            </button>
          ) : undefined;

          return (
            <LedgerRow key={s.id} href={`/startups/${s.slug}`} label={s.name} trailing={trailing}>
              <LedgerCell primary>
                <span className="cr-su-company">
                  <span className="cr-su-logo">
                    <EntityLogo name={s.name} logoUrl={s.logo_url} logoColor={s.logo_color} size={32} />
                  </span>
                  <span className="cr-su-company__text">
                    <span className="cr-su-name">
                      <span className="cr-row-title" data-viewed={viewed ? "" : undefined}>{s.name}</span>
                      {viewed && <span className="sr-only">{t("startups.viewed")}</span>}
                      {s.is_demo && <DemoBadge />}
                    </span>
                    {s.tagline && <span className="cr-row-sub">{s.tagline}</span>}
                  </span>
                </span>
              </LedgerCell>
              <LedgerCell>
                <span className="cr-row-sub cr-su-indent">
                  {startupMetaBits(s, t).join(" · ")}
                  {match !== undefined && match >= MATCH_FLOOR && (
                    <>
                      {" · "}
                      <span className="cr-su-match">{t("filters.matchPct", { pct: match })}</span>
                    </>
                  )}
                </span>
              </LedgerCell>
              <LedgerCell figure>
                {isValidFundingTarget(s.funding_target)
                  ? money(s.funding_target)
                  : <span className="cr-absent">{notStated}</span>}
              </LedgerCell>
              {scoreColumn && (
                <LedgerCell figure>
                  <span className="cr-su-indent">
                    <span className="cr-su-score-label">{t("listings.score")}</span>
                    {s.vaultrise_score != null
                      ? s.vaultrise_score
                      : <span className="cr-absent">{t("startup.scoreNone")}</span>}
                  </span>
                </LedgerCell>
              )}
            </LedgerRow>
          );
        })}
      </Ledger>
    );
  }

  const footItems: ReactNode[] = [];
  if (!loading && !loadError && (hasMore || canFetchMore)) {
    const more = hasMore
      ? Math.min(PAGE_SIZE, filtered.length - visible.length)
      : Math.min(1000, serverTotal - allStartups.length);
    footItems.push(
      <button
        key="more"
        type="button"
        className="cr-btn cr-btn--text cr-su-text-action"
        aria-busy={loadingMore || undefined}
        onClick={() => { if (loadingMore) return; if (hasMore) setPage((p) => p + 1); else void loadMoreRows(); }}
      >
        {loadingMore ? t("common.loading") : t("startups.loadMore", { count: more })}
      </button>,
    );
  }
  if (viewer.dataExport && ledgerShown) {
    footItems.push(
      <button key="csv" type="button" className={`cr-btn cr-btn--text${footItems.length === 0 ? " cr-su-text-action" : ""}`} onClick={exportCsv}>
        {t("startups.exportCsv")}
      </button>,
    );
  }
  if (!loading && dismissedIds.size > 0) {
    footItems.push(
      <button key="hidden" type="button" className={`cr-btn cr-btn--text${footItems.length === 0 ? " cr-su-text-action" : ""}`} onClick={toggleHiddenView}>
        {showHidden
          ? tf("startups.ledger.showAll", "Show all rounds")
          : t("startups.showHidden", { count: dismissedIds.size })}
      </button>,
    );
  }

  return (
    <div style={FRAME}>
      <style>{LANE_CSS}</style>

      <PageHeader title={t("nav.startups")} count={headerCount} end={headerEnd} />

      {showBar && (
        <FilterBar
          aria-label={t("filters.title")}
          search={
            <FilterSearch
              value={filters.query}
              onChange={(next) => patch({ query: next })}
              label={t("common.search")}
              placeholder={t("startups.search")}
              inputRef={searchRef}
            />
          }
          activeCount={activeCount}
          onClear={clearFilters}
          sticky={total > STICKY_ABOVE_ROWS}
          sheetDoneLabel={filtered.length > 0 ? t("filters.applyCount", { count: filtered.length }) : t("common.done")}
          sort={pool.length >= 2 ? <SortSelect options={sortOptions} value={sort} onChange={(next) => patch({ sort: next })} /> : undefined}
        >
          {controls.length > 0 ? controls : undefined}
        </FilterBar>
      )}

      {ledgerShown && trailingKind !== "unhide" && (
        <div className="cr-su-viewrow">
          <div className="cr-su-viewtoggle" role="group" aria-label={tf("startups.ledger.viewMode", "Layout")}>
            <button
              type="button"
              className="cr-su-viewtoggle__btn"
              aria-pressed={viewMode === "grid"}
              aria-label={tf("startups.ledger.viewGrid", "Grid view")}
              onClick={() => chooseView("grid")}
            >
              <LayoutGrid size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="cr-su-viewtoggle__btn"
              aria-pressed={viewMode === "list"}
              aria-label={tf("startups.ledger.viewList", "List view")}
              onClick={() => chooseView("list")}
            >
              <List size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {showUpsell && (
        <p className="cr-su-upsell">
          {tf("startups.ledger.upsell", "Financials and AI consistency scores come with a paid investor plan.")}{" "}
          <Link href="/pricing" className="cr-link">{t("common.upgrade")}</Link>
        </p>
      )}

      {body}

      {footItems.length > 0 && <div className="cr-ledger-foot">{footItems}</div>}

      {/* One footnote block under the list. The broker-dealer line is a
          compliance requirement wherever financial data is shown; the score
          caption travels with the score column and never without it. */}
      <div className="cr-footnote">
        {scoreColumn && <ScoreCaption style={FOOTNOTE_TEXT} />}
        <p>{t("legal.brokerDisclaimer")}</p>
      </div>
    </div>
  );
}
