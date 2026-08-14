"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Search, SlidersHorizontal, X, LayoutGrid, List, ChevronDown, Bookmark, Eye, EyeOff, GitCompareArrows, Clock } from "lucide-react";
import { formatCurrency, getInitials, STAGE_LABELS } from "@/lib/utils";
import { safeFormatMRR, safeFormatCurrencyAmount, isValidFundingTarget } from "@/lib/validators";
import { computeMatchScore, type InvestorThesis } from "@/lib/match-score";
import { STARTUP_PRESETS } from "@/lib/search-presets";
import { FilterPresets } from "@/components/search/filter-presets";
import { notify } from "@/components/ui/toast-notify";
import { announce } from "@/lib/announce";
import { normalizeCountry, sameCountry } from "@/lib/countries";
import { EmptyState as EmptyStateBlock } from "@/components/ui/EmptyState";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { ScoreRing } from "@/components/ui/ScoreRing";

// ── Constants ─────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "AI / Machine Learning", "B2B SaaS", "Consumer", "Crypto / Web3",
  "EdTech", "FinTech", "HealthTech", "HRTech", "LegalTech", "PropTech",
  "Climate / CleanTech", "E-commerce", "Gaming", "Marketplace",
  "DeepTech", "Biotech", "Cybersecurity", "Other",
];

const STAGES = [
  { value: "pre-seed",      label: "Pre-Seed"  },
  { value: "seed",          label: "Seed"       },
  { value: "series_a",      label: "Series A"   },
  { value: "series_b_plus", label: "Series B+"  },
];


// mrrMin, aiScoreMin and country have been in the filter state and applied by
// the filter logic since this component was written -- but nothing ever
// rendered a control for them, so they were dead depth. Preset chips rather
// than sliders/inputs to stay inside the page's single control convention.
const MRR_PRESETS = [
  { value: 5_000,   label: "MRR $5k+"   },
  { value: 25_000,  label: "MRR $25k+"  },
  { value: 100_000, label: "MRR $100k+" },
];
const SCORE_PRESETS = [
  { value: 60, label: "Score 60+" },
  { value: 80, label: "Score 80+" },
];

const RAISING_PRESETS = [
  { value: 1_000_000, label: "Raising $1M+" },
  { value: 2_000_000, label: "Raising $2M+" },
];

const SORT_OPTIONS = [
  { value: "score",   label: "AI Score"      },
  { value: "recent",  label: "Newest"         },
  { value: "updated", label: "Recently updated" },
  { value: "mrr",     label: "Highest MRR"   },
  { value: "funding", label: "Funding Target" },
];

const PAGE_SIZE = 24;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Startup {
  id: string; slug: string; name: string; tagline: string;
  industry: string; stage: string; funding_target: number;
  mrr: number | null; arr: number | null; growth_rate: number | null;
  runway_months: number | null; created_at: string; updated_at: string;
  vaultrise_score: number | null;
  country: string | null; business_model: string | null; round_close_date: string | null;
}

interface Filters {
  query: string; industries: string[]; stages: string[];
  mrrMin: number; aiScoreMin: number; sort: string; country: string;
  newOnly?: boolean;
  raisingMin?: number; runwayMin?: number; growthMin?: number;
}

const DEFAULT_FILTERS: Filters = {
  query: "", industries: [], stages: [],
  mrrMin: 0, aiScoreMin: 0, sort: "score", country: "", newOnly: false,
  raisingMin: 0, runwayMin: 0, growthMin: 0,
};

// ── Saved searches ────────────────────────────────────────────────────────────

interface SavedSearch { id: string; name: string; filters: Partial<Filters>; }

/**
 * Save the current filter set and come back to it.
 *
 * canUseSavedSearches() has been a plan capability and a pricing-page bullet
 * since the tier system existed, with no table behind it until migration 021.
 *
 * Renders nothing at all for signed-out visitors and for founders -- this is an
 * investor tool, and an empty bar on a public page is just noise. The plan gate
 * lives on the server; a 403 here surfaces as an upgrade prompt rather than a
 * hidden button, because a feature you cannot see is a feature you will not buy.
 */
function SavedSearches({ filters, onApply, isDefault }: {
  filters: Filters;
  onApply: (f: Partial<Filters>) => void;
  isDefault: boolean;
}) {
  const { t } = useTranslation();
  const [searches, setSearches] = useState<SavedSearch[] | null>(null);
  const [naming, setNaming]     = useState(false);
  const [name, setName]         = useState("");
  const [busy, setBusy]         = useState(false);

  useEffect(() => {
    fetch("/api/saved-searches")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSearches(d?.searches ?? null))
      .catch(() => setSearches(null));
  }, []);

  // null means "not an investor, or not signed in" -- render nothing.
  if (searches === null) return null;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) { setNaming(false); return; }
    setBusy(true);
    const res = await fetch("/api/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, filters }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setNaming(false);
    setName("");
    if (!res.ok) {
      notify.error(body.upgrade ? t("startups.savedSearchUpgrade") : (body.error || t("startups.savedSearchFailed")));
      return;
    }
    // Replace an entry of the same name rather than appending a duplicate --
    // the server upserts on (investor_id, name), so the list must too.
    setSearches((prev) => [body.search, ...(prev ?? []).filter((s) => s.id !== body.search.id)]);
    notify.success(t("startups.savedSearchSaved"));
  }

  async function remove(id: string) {
    setSearches((prev) => (prev ?? []).filter((s) => s.id !== id));   // optimistic
    const res = await fetch("/api/saved-searches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) notify.error(t("startups.savedSearchDeleteFailed"));
  }

  return (
    <div style={{ background: "var(--cr-paper-2)", borderBottom: "1px solid var(--cr-rule)" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "8px 80px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)" }}>
          {t("startups.savedSearches")}
        </span>

        {searches.map((s) => (
          <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "20px", padding: "3px 4px 3px 11px" }}>
            <button onClick={() => onApply(s.filters)}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink-2)", padding: 0 }}>
              {s.name}
            </button>
            <button onClick={() => remove(s.id)} aria-label={t("startups.savedSearchDelete", { name: s.name })}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", display: "flex", padding: "2px" }}>
              <X style={{ width: 11, height: 11 }} />
            </button>
          </span>
        ))}

        {naming ? (
          <input
            autoFocus value={name} disabled={busy}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setName(""); setNaming(false); }
            }}
            maxLength={80}
            placeholder={t("startups.savedSearchNamePlaceholder")}
            style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-copper)", borderRadius: "20px", padding: "4px 11px", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-ink)", outline: "none", width: "180px" }}
          />
        ) : (
          // Saving the default, empty filter set would just create an entry
          // that does nothing, so the affordance only appears once something
          // is actually filtered.
          !isDefault && (
            <button onClick={() => setNaming(true)}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", color: "var(--cr-copper)", textDecoration: "underline", padding: 0 }}>
              + {t("startups.saveThisSearch")}
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ── Primitives ────────────────────────────────────────────────────────────────

/**
 * A labelled dropdown holding a group of FilterChips. Replaces the old
 * always-visible chip soup: fifteen chips in a scrolling strip read as
 * noise, three labelled groups with counts read as a system.
 */
function FilterGroup({ label, count, open, onToggle, children }: {
  label: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const doneLabel = t("common.done");

  // Only the mobile sheet is modal. The desktop dropdown is an anchored panel
  // the user should be able to scroll past, so the lock is gated on the same
  // breakpoint the CSS uses rather than on `open` alone.
  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 1023px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={onToggle}
        style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          fontFamily: "'DM Sans', sans-serif", fontWeight: count > 0 ? 500 : 400, fontSize: "13px",
          padding: "6px 12px", borderRadius: "3px",
          border: count > 0 ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)",
          background: count > 0 ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
          color: count > 0 ? "var(--cr-copper)" : "var(--cr-ink-3)",
          cursor: "pointer", whiteSpace: "nowrap",
        }}>
        {label}{count > 0 ? ` · ${count}` : ""}
        <ChevronDown style={{ width: 12, height: 12, transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms" }} />
      </button>
      {/* Desktop: a panel anchored under its chip. */}
      {open && (
        <div className="hidden lg:flex" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: "280px", maxWidth: "min(90vw, 420px)", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", boxShadow: "0 8px 24px rgba(26,22,18,0.12)", padding: "12px", flexWrap: "wrap", gap: "6px", zIndex: 50 }}>
          {children}
        </div>
      )}

      {/* Mobile: a bottom sheet, because anchoring cannot work here. The chips
          live in a horizontally scrolling row, so a chip scrolled to x=300 on a
          375px screen opened a 280px panel mostly off the right edge -- and the
          panel could not be scrolled back into view because the row scrolls,
          not the page. A sheet is anchored to the viewport instead of the chip,
          so it is always fully reachable, and it sits within thumb reach rather
          than up under the sticky bar. */}
      {open && (
        <div className="lg:hidden">
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.4)", zIndex: 95 }}
            onClick={onToggle}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            style={{
              position: "fixed", insetInline: 0,
              bottom: "var(--cr-tabbar-h, 0px)",
              zIndex: 96,
              background: "var(--cr-paper-2)",
              borderTop: "1px solid var(--cr-rule-dark)",
              borderRadius: "12px 12px 0 0",
              boxShadow: "0 -10px 34px rgba(26,22,18,0.22)",
              maxHeight: "70vh",
              display: "flex", flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "14px 16px 10px", borderBottom: "1px solid var(--cr-rule)" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "var(--cr-ink)" }}>
                {label}
              </span>
              <button
                onClick={onToggle}
                style={{ minHeight: "36px", paddingInline: "14px", border: "1px solid var(--cr-rule-dark)", background: "var(--cr-paper-3)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink-2)", cursor: "pointer" }}
              >
                {doneLabel}
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "14px 16px", overflowY: "auto", paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))" }}>
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One applied filter in the summary row: label + its own remove control. */
function AppliedChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "12px", color: "var(--cr-copper)", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "3px", padding: "3px 6px 3px 10px" }}>
      {label}
      <button onClick={onRemove} aria-label={`remove ${label}`}
        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
        <X style={{ width: 11, height: 11 }} />
      </button>
    </span>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily:    "'DM Sans', sans-serif",
        fontWeight:    active ? 500 : 400,
        fontSize:      "13px",
        padding:       "6px 14px",
        borderRadius:  "3px",
        border:        active ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)",
        background:    active ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
        color:         active ? "var(--cr-copper)" : "var(--cr-ink-3)",
        cursor:        "pointer",
        whiteSpace:    "nowrap",
        transition:    "all 100ms ease",
      }}
    >
      {children}
    </button>
  );
}

function SkeletonCard() {
  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
        <div className="skeleton" style={{ width: 40, height: 40, borderRadius: "4px" }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: "50%", borderRadius: "2px", marginBottom: "8px" }} />
          <div className="skeleton" style={{ height: 11, width: "75%", borderRadius: "2px" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
        <div className="skeleton" style={{ height: 20, width: 80, borderRadius: "3px" }} />
        <div className="skeleton" style={{ height: 20, width: 56, borderRadius: "3px" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
        {[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 52, borderRadius: "3px" }} />)}
      </div>
      <div style={{ height: 1, background: "var(--cr-rule)", marginBottom: "12px" }} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div className="skeleton" style={{ height: 18, width: 60, borderRadius: "2px" }} />
        <div className="skeleton" style={{ height: 14, width: 80, borderRadius: "2px" }} />
      </div>
    </div>
  );
}

function NoResults({ query, hasFilters, onReset }: { query: string; hasFilters: boolean; onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <div style={{ gridColumn: "1 / -1" }}>
      {/* Was a bespoke block whose heading and body rendered the same string
          ("No results" twice) whenever a query was set. Now the shared shell,
          with the body carrying the way out rather than repeating the title. */}
      <EmptyStateBlock
        Icon={Search}
        title={query ? t("startups.noResultsFor", { query }) : t("startups.noListings")}
        body={hasFilters ? t("startups.noResultsBody") : undefined}
        action={hasFilters ? (
          <button onClick={onReset} style={{
            background: "transparent", color: "var(--cr-ink-3)",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
            minHeight: "40px", padding: "8px 20px", borderRadius: "4px",
            border: "1px solid var(--cr-rule-dark)", cursor: "pointer",
          }}>
            {t("filters.clearAll")}
          </button>
        ) : undefined}
      />
    </div>
  );
}

// ── Search result card ────────────────────────────────────────────────────────

function ResultCard({ s, saved, viewed, hidden, comparing, match, onSave, onHide, onCompare }: { s: Startup; saved: boolean; viewed?: boolean; hidden?: boolean; comparing?: boolean; match?: number; onSave: (id: string) => void; onHide?: (id: string) => void; onCompare?: (id: string) => void }) {
  const { t } = useTranslation();
  const score = s.vaultrise_score ?? null;
  const isNew = Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000) <= 5;

  return (
    <Link href={`/startups/${s.slug}`} style={{ display: "block", textDecoration: "none" }}>
      <div
        style={{
          position: "relative", display: "flex", flexDirection: "column",
          background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
          borderRadius: "4px", padding: "20px",
          transition: "background 120ms ease, border-color 120ms ease", cursor: "pointer",
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
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSave(s.id); }}
          style={{ position: "absolute", top: "14px", right: "14px", background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex" }}
          aria-label={saved ? "Remove" : "Save"}
        >
          <Bookmark style={{ width: 15, height: 15, color: saved ? "var(--cr-copper)" : "var(--cr-ink-4)", fill: saved ? "var(--cr-copper)" : "transparent" }} />
        </button>
        {onHide && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide(s.id); }}
            style={{ position: "absolute", top: "38px", right: "14px", background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex" }}
            aria-label={hidden ? t("startups.unhide") : t("startups.hide")}
            title={hidden ? t("startups.unhide") : t("startups.hide")}
          >
            <EyeOff style={{ width: 14, height: 14, color: hidden ? "var(--cr-copper)" : "var(--cr-paper-4)" }} />
          </button>
        )}
        {onCompare && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCompare(s.id); }}
            style={{ position: "absolute", top: "60px", right: "14px", background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex" }}
            aria-label={t("startups.compare")}
            title={t("startups.compare")}
          >
            <GitCompareArrows style={{ width: 14, height: 14, color: comparing ? "var(--cr-copper)" : "var(--cr-paper-4)" }} />
          </button>
        )}

        {/* Logo + Name */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "14px", paddingRight: "24px" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "4px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "14px", color: "var(--cr-copper)",
          }}>
            {getInitials(s.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "16px", color: "var(--cr-ink)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.name}
            </p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.tagline}
            </p>
          </div>
          {score !== null && <ScoreRing score={score} size={36} strokeWidth={3} />}
        </div>

        {/* Badges */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }}>
          {viewed && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", color: "var(--cr-ink-4)" }} title={t("startups.viewed")}>
              <Eye style={{ width: 11, height: 11 }} /> {t("startups.viewed")}
            </span>
          )}
          {match !== undefined && match >= 40 && (
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", color: "#fff", background: "var(--cr-copper)", borderRadius: "999px", padding: "2px 8px", letterSpacing: "0.03em" }}>
              {t("filters.matchPct", { pct: match })}
            </span>
          )}
          <span style={{ background: "transparent", border: "1px solid var(--cr-rule-dark)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "2px", padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {s.industry}
          </span>
          <span style={{ background: "transparent", border: "1px solid var(--cr-rule)", color: "var(--cr-ink-4)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", borderRadius: "2px", padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {STAGE_LABELS[s.stage] ?? s.stage}
          </span>
          {isNew && (
            <span style={{ background: "transparent", border: "1px solid rgba(45,106,79,0.35)", color: "var(--cr-up)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              New
            </span>
          )}
        </div>

        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
          {[
            { label: t("startupDetail.mrr"),    val: s.mrr         ? safeFormatMRR(s.mrr)                                       : null },
            { label: t("startupDetail.arr"),    val: s.arr         ? safeFormatMRR(s.arr)                                       : null },
            { label: t("startupDetail.growth"), val: s.growth_rate ? `${s.growth_rate > 0 ? "+" : ""}${s.growth_rate}%` : null, isGrowth: true, positiveGrowth: (s.growth_rate ?? 0) > 0 },
          ].map(({ label, val, isGrowth, positiveGrowth }) => (
            <div key={label} style={{ background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "3px", padding: "8px 10px 7px" }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>{label}</div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px",
                color: val ? (isGrowth ? (positiveGrowth ? "var(--cr-up)" : "var(--cr-down)") : "var(--cr-ink)") : "var(--cr-ink-4)",
              }}>
                {val ?? "—"}
              </div>
            </div>
          ))}
        </div>

        {/* Raise strip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid var(--cr-rule)" }}>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>{t("listings.raising")}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", color: "var(--cr-copper)" }}>
              {safeFormatCurrencyAmount(s.funding_target)}
            </div>
          </div>
          {s.runway_months != null && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>
              {t("startups.runway", { months: s.runway_months ?? 0 })}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function StartupsSearch() {
  const { t } = useTranslation();
  const searchParams  = useSearchParams();

  // The whole filter set lives in the address bar: a filtered view can be
  // shared, bookmarked, or revisited via back/forward. Parsing happens once
  // as the initial state; writing back is debounced below.
  const initialFilters: Filters = {
    ...DEFAULT_FILTERS,
    query:      searchParams.get("q") ?? "",
    industries: searchParams.get("industries")?.split(",").filter(Boolean) ?? [],
    stages:     searchParams.get("stages")?.split(",").filter(Boolean) ?? [],
    mrrMin:     Number(searchParams.get("mrr")) || 0,
    aiScoreMin: Number(searchParams.get("score")) || 0,
    country:    searchParams.get("country") ?? "",
    newOnly:    searchParams.get("new") === "1",
    raisingMin: Number(searchParams.get("raising")) || 0,
    runwayMin:  Number(searchParams.get("runway")) || 0,
    growthMin:  Number(searchParams.get("growth")) || 0,
    sort:       searchParams.get("sort") ?? DEFAULT_FILTERS.sort,
  };

  const [filters, setFilters]         = useState<Filters>(initialFilters);
  const [viewMode, setViewMode]       = useState<"grid" | "list">("grid");
  useEffect(() => {
    const saved = localStorage.getItem("cr-browse-view");
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);
  function chooseView(v: "grid" | "list") {
    setViewMode(v);
    try { localStorage.setItem("cr-browse-view", v); } catch { /* private mode */ }
  }
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allStartups, setAllStartups] = useState<Startup[]>([]);
  const [loading, setLoading]         = useState(true);
  const [page, setPage]               = useState(1);
  const [savedIds, setSavedIds]       = useState<Set<string>>(new Set());
  // Which listings this investor has already opened. startup_views RLS is
  // scoped to the viewing investor, so the bare select returns only their own
  // history; anonymous and founder sessions just get an empty set.
  const [viewedIds, setViewedIds]     = useState<Set<string>>(new Set());
  // "Not for me" (migration 033). RLS scopes rows to the signed-in investor,
  // so reads and writes go straight through the client. Hidden listings drop
  // out of browse behind a show-hidden escape hatch.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden]     = useState(false);
  const myInvestorId = useRef<string | null>(null);
  // The viewer's own thesis powers the fit sort. Absent for founders and
  // anonymous visitors, which is exactly when the sort option is hidden.
  const [myThesis, setMyThesis] = useState<InvestorThesis | null>(null);
  const [lastHidden, setLastHidden] = useState<{ id: string; name: string } | null>(null);
  // Compare tray: up to three listings side by side. Pure client state.
  const [compareIds, setCompareIds] = useState<string[]>([]);
  // Compare tray survives reloads; unknown ids are dropped once data arrives.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cr_compare");
      if (raw) setCompareIds(JSON.parse(raw).slice(0, 3));
    } catch { /* corrupted storage — start empty */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("cr_compare", JSON.stringify(compareIds)); } catch { /* quota */ }
  }, [compareIds]);
  const [showCompare, setShowCompare] = useState(false);
  function toggleCompare(id: string) {
    setCompareIds((prev) => prev.includes(id)
      ? prev.filter(x => x !== id)
      : prev.length >= 3 ? prev : [...prev, id]);
  }
  const [sortOpen, setSortOpen]       = useState(false);
  // Typeahead: name matches from the already-loaded list, so suggestions are
  // instant and need no network round trip or debounce.
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIdx, setSuggestIdx] = useState(-1);
  // Recent queries, newest first, capped at 10 (FIFO). Local only: a search
  // history is the user's business, and nothing here needs a round trip.
  const RECENT_KEY = "cr_recent_startup_searches";
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")); } catch { /* corrupt */ }
  }, []);
  function rememberQuery(qq: string) {
    const term = qq.trim();
    if (term.length < 2) return;
    setRecent((prev) => {
      const next = [term, ...prev.filter((x) => x !== term)].slice(0, 10);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }
  function forgetQuery(term: string) {
    setRecent((prev) => {
      const next = prev.filter((x) => x !== term);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }
  const [openGroup, setOpenGroup] = useState<null | "industry" | "stage" | "traction" | "region">(null);
  const suggestions = filters.query.trim().length >= 2
    ? allStartups
        .filter(s => s.name.toLowerCase().includes(filters.query.trim().toLowerCase()))
        .slice(0, 6)
    : [];
  const supabase = useRef(createClient()).current;
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/startups/list");
        const json = await res.json();
        setAllStartups((json.startups as Startup[]) ?? []);
      } catch {
        setAllStartups([]);
      }
      setLoading(false);
    }
    load();
    // View history for the seen tick -- one row per (investor, startup, day),
    // deduped to a set of ids here.
    supabase.from("startup_views").select("startup_id").limit(1000)
      .then(({ data }) => { if (data) setViewedIds(new Set(data.map(v => v.startup_id))); });
    supabase.from("startup_dismissals").select("startup_id").limit(1000)
      .then(({ data }) => { if (data) setDismissedIds(new Set(data.map(v => v.startup_id))); });
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
    // "/" jumps to search from anywhere on the page, unless already typing.
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

  // How many listings each option would return, computed from the loaded
  // set. Counts ignore the dimension they belong to (picking a second
  // industry should widen, not zero out) but respect the visible universe.
  const facets = useMemo(() => {
    const pool = allStartups.filter((s) => showHidden ? dismissedIds.has(s.id) : !dismissedIds.has(s.id));
    const industry: Record<string, number> = {};
    const stage: Record<string, number> = {};
    const country: Record<string, number> = {};
    for (const s of pool) {
      industry[s.industry] = (industry[s.industry] ?? 0) + 1;
      stage[s.stage] = (stage[s.stage] ?? 0) + 1;
      // Keyed on the canonical name, so "germany", "Germany" and
      // "Deutschland" are one region with one combined count instead of
      // three facets that each hide the others' listings.
      const c = normalizeCountry(s.country);
      if (c) country[c] = (country[c] ?? 0) + 1;
    }
    return { industry, stage, country };
  }, [allStartups, dismissedIds, showHidden]);

  const filtered = useMemo(() => {
    let res = allStartups.filter((s) => {
      const q     = filters.query.toLowerCase();
      const score = s.vaultrise_score ?? 0;
      if (q && !s.name.toLowerCase().includes(q) && !s.tagline.toLowerCase().includes(q)) return false;
      if (filters.industries.length && !filters.industries.includes(s.industry)) return false;
      if (filters.stages.length && !filters.stages.includes(s.stage)) return false;
      if (filters.mrrMin > 0 && (s.mrr ?? 0) < filters.mrrMin) return false;
      if (filters.aiScoreMin > 0 && score < filters.aiScoreMin) return false;
      // Compared canonically for the same reason the facet is keyed that way.
      if (filters.country && !sameCountry(s.country, filters.country)) return false;
      if (filters.newOnly && (Date.now() - new Date(s.created_at).getTime()) / 86400000 > 7) return false;
      if ((filters.raisingMin ?? 0) > 0 && s.funding_target < filters.raisingMin!) return false;
      if ((filters.runwayMin ?? 0) > 0 && (s.runway_months ?? 0) < filters.runwayMin!) return false;
      if ((filters.growthMin ?? 0) > 0 && (s.growth_rate ?? 0) < filters.growthMin!) return false;
      if (!showHidden && dismissedIds.has(s.id)) return false;
      if (showHidden && !dismissedIds.has(s.id)) return false;
      return true;
    });

    switch (filters.sort) {
      case "score":   res = [...res].sort((a, b) => ((b.vaultrise_score ?? 0) - (a.vaultrise_score ?? 0))); break;
      case "mrr":     res = [...res].sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0)); break;
      case "recent":  res = [...res].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case "updated": res = [...res].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()); break;
      case "funding": res = [...res].sort((a, b) => b.funding_target - a.funding_target); break;
      case "fit":     res = myThesis ? [...res].sort((a, b) => computeMatchScore(myThesis, b).score - computeMatchScore(myThesis, a).score) : res; break;
    }
    return res;
  }, [filters, allStartups, dismissedIds, showHidden, myThesis]);

  const visible    = filtered.slice(0, page * PAGE_SIZE);
  const hasMore    = visible.length < filtered.length;
  const activeCount = [
    filters.industries.length, filters.stages.length,
    filters.mrrMin > 0 ? 1 : 0, filters.aiScoreMin > 0 ? 1 : 0,
    filters.country ? 1 : 0,
    filters.newOnly ? 1 : 0,
    filters.raisingMin ? 1 : 0, filters.runwayMin ? 1 : 0, filters.growthMin ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Filtering rewrites the whole grid without a navigation, which is silent to
  // a screen reader: focus never moves and no page loads, so the only way to
  // learn whether a filter did anything is to tab through the results. The
  // first render is skipped -- announcing a count while the page title is
  // still being read is noise, not information.
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

  const resetFilters = useCallback(() => { setFilters(DEFAULT_FILTERS); setPage(1); }, []);

  // Write the filter set back to the address bar. replaceState rather than the
  // router: no server round trip, no history spam -- back/forward still works
  // across real navigations, and the current URL is always shareable.
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
      if (filters.raisingMin)         p.set("raising", String(filters.raisingMin));
      if (filters.runwayMin)          p.set("runway", String(filters.runwayMin));
      if (filters.growthMin)          p.set("growth", String(filters.growthMin));
      if (filters.sort !== DEFAULT_FILTERS.sort) p.set("sort", filters.sort);
      const qs = p.toString();
      const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      if (next !== window.location.pathname + window.location.search) {
        window.history.replaceState(window.history.state, "", next);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [filters]);

  function toggleSave(id: string) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); notify.info(t("toast.unsaved")); }
      else { next.add(id); notify.success(t("toast.saved")); }
      return next;
    });
  }

  async function toggleHide(id: string) {
    const inv = myInvestorId.current;
    if (!inv) { notify.info(t("startups.hideNeedsAccount")); return; }
    const hidden = dismissedIds.has(id);
    // Optimistic; RLS enforces ownership server-side either way.
    setDismissedIds((prev) => {
      const next = new Set(prev);
      if (hidden) next.delete(id); else next.add(id);
      return next;
    });
    if (!hidden) {
      const name = allStartups.find(x => x.id === id)?.name ?? "";
      setLastHidden({ id, name });
      setTimeout(() => setLastHidden((cur) => (cur?.id === id ? null : cur)), 8000);
    } else if (lastHidden?.id === id) {
      setLastHidden(null);
    }
    if (hidden) {
      await supabase.from("startup_dismissals").delete().eq("investor_id", inv).eq("startup_id", id);
    } else {
      await supabase.from("startup_dismissals").upsert(
        { investor_id: inv, startup_id: id }, { onConflict: "investor_id,startup_id" });
    }
  }

  // "Best match for me" only exists for a viewer with a thesis to match on.
  const sortOptions = myThesis
    ? [...SORT_OPTIONS, { value: "fit", label: t("filters.bestMatch") }]
    : SORT_OPTIONS;
  const sortLabel = sortOptions.find((o) => o.value === filters.sort)?.label ?? t("filters.sort");

  return (
    <div style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>

      {/* ── Page header ── */}
      <div style={{ borderBottom: "1px solid var(--cr-rule)", padding: "48px 80px 32px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div className="ruled-label" style={{ marginBottom: "12px" }}>{t("dashboard.dealFlow")}</div>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(32px, 4vw, 48px)", color: "var(--cr-ink)", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "10px" }}>
                {t("startups.pageTitle")}
              </h1>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)" }}>
                {loading ? t("common.loading") : allStartups.length > 0
                  ? t("startups.pageSubtitle", { count: allStartups.length })
                  : t("startups.noListings")}
              </p>
            </div>

            {/* Desktop: sort + view toggle */}
            <div className="hidden lg:flex" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Sort dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setSortOpen((o) => !o)}
                  style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", padding: "8px 14px", cursor: "pointer" }}
                >
                  {sortLabel} <ChevronDown style={{ width: 13, height: 13 }} />
                </button>
                {sortOpen && (
                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", width: "180px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "4px", zIndex: 50 }}>
                    {sortOptions.map((o) => (
                      <button key={o.value} onClick={() => { patch({ sort: o.value }); setSortOpen(false); }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontFamily: "'DM Sans', sans-serif", fontWeight: filters.sort === o.value ? 600 : 400, fontSize: "13px", color: filters.sort === o.value ? "var(--cr-copper)" : "var(--cr-ink-3)", background: "transparent", border: "none", cursor: "pointer", borderRadius: "3px" }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--cr-paper-3)")}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* View toggle */}
              <div style={{ display: "flex", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule)", borderRadius: "4px", overflow: "hidden" }}>
                {(["grid", "list"] as const).map((v) => (
                  <button key={v} onClick={() => chooseView(v)}
                    style={{ padding: "7px 10px", background: viewMode === v ? "var(--cr-ink)" : "transparent", color: viewMode === v ? "#fff" : "var(--cr-ink-4)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", transition: "background 100ms ease" }}>
                    {v === "grid" ? <LayoutGrid style={{ width: 15, height: 15 }} /> : <List style={{ width: 15, height: 15 }} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Saved searches ── */}
      <SavedSearches
        filters={filters}
        onApply={(f) => setFilters({ ...DEFAULT_FILTERS, ...f })}
        isDefault={JSON.stringify(filters) === JSON.stringify({ ...DEFAULT_FILTERS, query: filters.query }) && !filters.query}
      />

      {/* ── Sticky filter bar ── */}
      <div style={{ position: "sticky", top: "56px", zIndex: 40, background: "var(--cr-paper)", borderBottom: "1px solid var(--cr-rule-dark)" }}>
        {/* No overflowX here: it clipped the open filter-group panels. The three
            groups fit every viewport; anything past them wraps instead. */}
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "10px 80px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Search style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--cr-ink-4)" }} />
            <input
              ref={searchRef}
              type="text"
              value={filters.query}
              onChange={(e) => { patch({ query: e.target.value }); setSuggestOpen(true); setSuggestIdx(-1); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setSuggestOpen(false); return; }
                if (!suggestions.length) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setSuggestIdx(i => Math.min(i + 1, suggestions.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setSuggestIdx(i => Math.max(i - 1, -1)); }
                else if (e.key === "Enter") {
                  rememberQuery(filters.query);
                  if (suggestIdx >= 0) {
                    e.preventDefault();
                    window.location.href = `/startups/${suggestions[suggestIdx].slug}`;
                  }
                }
              }}
              placeholder={t("startups.search")}
              style={{
                background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
                borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
                fontSize: "13px", color: "var(--cr-ink)", paddingLeft: "32px", paddingRight: "12px",
                paddingTop: "7px", paddingBottom: "7px", width: "200px", outline: "none",
              }}
              onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)"; setSuggestOpen(true); }}
              onBlur={e  => { (e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)"; setTimeout(() => setSuggestOpen(false), 150); }}
            />
            {suggestOpen && filters.query.trim().length < 2 && recent.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: "280px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", boxShadow: "0 8px 24px rgba(26,22,18,0.12)", overflow: "hidden", zIndex: 50 }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 12px 6px" }}>
                  {t("startups.recentSearches")}
                </p>
                {recent.slice(0, 5).map((term) => (
                  <div key={term} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "7px 12px" }}>
                    <button onMouseDown={(e) => { e.preventDefault(); patch({ query: term }); }}
                      style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)", padding: 0, textAlign: "left", flex: 1 }}>
                      <Clock style={{ width: 12, height: 12, color: "var(--cr-ink-4)", flexShrink: 0 }} /> {term}
                    </button>
                    <button onMouseDown={(e) => { e.preventDefault(); forgetQuery(term); }} aria-label={`remove ${term}`}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", fontSize: "13px", lineHeight: 1, padding: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            {suggestOpen && suggestions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: "280px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", boxShadow: "0 8px 24px rgba(26,22,18,0.12)", overflow: "hidden", zIndex: 50 }}>
                {suggestions.map((s, si) => (
                  <Link key={s.id} href={`/startups/${s.slug}`} onClick={() => rememberQuery(filters.query)}
                    style={{ display: "flex", flexDirection: "column", gap: "1px", padding: "9px 12px", textDecoration: "none", borderBottom: "1px solid var(--cr-rule)", background: si === suggestIdx ? "var(--cr-paper-3)" : "transparent" }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "var(--cr-paper-3)")}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "13px", color: "var(--cr-ink)" }}>{s.name}</span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.tagline}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div style={{ width: 1, height: 20, background: "var(--cr-rule-dark)", flexShrink: 0 }} />

          {/* Grouped filters: three labelled dropdowns instead of fifteen
              always-visible chips. Full industry list too -- the strip only
              ever had room for the first six. */}
          <FilterGroup label={t("startups.industry")} count={filters.industries.length}
            open={openGroup === "industry"} onToggle={() => setOpenGroup(openGroup === "industry" ? null : "industry")}>
            {INDUSTRIES.filter((ind) => facets.industry[ind] || filters.industries.includes(ind)).map((ind) => (
              <FilterChip key={ind}
                active={filters.industries.includes(ind)}
                onClick={() => patch({ industries: filters.industries.includes(ind) ? filters.industries.filter(i => i !== ind) : [...filters.industries, ind] })}>
                {ind}{facets.industry[ind] ? ` (${facets.industry[ind]})` : ""}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup label={t("startups.stageGroup")} count={filters.stages.length}
            open={openGroup === "stage"} onToggle={() => setOpenGroup(openGroup === "stage" ? null : "stage")}>
            {STAGES.map((s) => (
              <FilterChip key={s.value}
                active={filters.stages.includes(s.value)}
                onClick={() => patch({ stages: filters.stages.includes(s.value) ? filters.stages.filter(x => x !== s.value) : [...filters.stages, s.value] })}>
                {s.label}{facets.stage[s.value] ? ` (${facets.stage[s.value]})` : ""}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup label={t("startups.traction")}
            count={(filters.mrrMin > 0 ? 1 : 0) + (filters.aiScoreMin > 0 ? 1 : 0) + (filters.newOnly ? 1 : 0) + (filters.raisingMin ? 1 : 0) + (filters.runwayMin ? 1 : 0) + (filters.growthMin ? 1 : 0)}
            open={openGroup === "traction"} onToggle={() => setOpenGroup(openGroup === "traction" ? null : "traction")}>
            {MRR_PRESETS.map((m) => (
              <FilterChip key={m.value}
                active={filters.mrrMin === m.value}
                onClick={() => patch({ mrrMin: filters.mrrMin === m.value ? 0 : m.value })}>
                {m.label}
              </FilterChip>
            ))}
            {SCORE_PRESETS.map((sc) => (
              <FilterChip key={sc.value}
                active={filters.aiScoreMin === sc.value}
                onClick={() => patch({ aiScoreMin: filters.aiScoreMin === sc.value ? 0 : sc.value })}>
                {sc.label}
              </FilterChip>
            ))}
            <FilterChip active={!!filters.newOnly}
              onClick={() => patch({ newOnly: !filters.newOnly })}>
              {t("startups.newThisWeek")}
            </FilterChip>
            {RAISING_PRESETS.map((r) => (
              <FilterChip key={r.value}
                active={filters.raisingMin === r.value}
                onClick={() => patch({ raisingMin: filters.raisingMin === r.value ? 0 : r.value })}>
                {r.label}
              </FilterChip>
            ))}
            <FilterChip active={(filters.runwayMin ?? 0) > 0}
              onClick={() => patch({ runwayMin: filters.runwayMin ? 0 : 12 })}>
              {t("startups.runway12")}
            </FilterChip>
            <FilterChip active={(filters.growthMin ?? 0) > 0}
              onClick={() => patch({ growthMin: filters.growthMin ? 0 : 20 })}>
              {t("startups.growth20")}
            </FilterChip>
          </FilterGroup>
          <FilterGroup label={t("startups.region")} count={filters.country ? 1 : 0}
            open={openGroup === "region"} onToggle={() => setOpenGroup(openGroup === "region" ? null : "region")}>
            {Array.from(new Set(allStartups.map(s => s.country).filter((c): c is string => !!c))).sort().map((c) => (
              <FilterChip key={c}
                active={filters.country === c}
                onClick={() => patch({ country: filters.country === c ? "" : c })}>
                {c}{facets.country[c] ? ` (${facets.country[c]})` : ""}
              </FilterChip>
            ))}
          </FilterGroup>

          {/* Mobile filter btn */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden"
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", padding: "7px 14px", cursor: "pointer", flexShrink: 0 }}
          >
            <SlidersHorizontal style={{ width: 13, height: 13 }} />
            {t("startups.filters")}{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>

          {/* Clear */}
          {(activeCount > 0 || filters.query) && (
            <button onClick={resetFilters}
              style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "1px solid var(--cr-paper-4)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-4)", padding: "6px 10px", cursor: "pointer", flexShrink: 0 }}>
              <X style={{ width: 11, height: 11 }} /> {t("filters.clearAll")}
            </button>
          )}
        </div>

        {/* One-click shortcuts. Above the applied chips so the relationship
            reads top-down: pick a preset, see what it applied. */}
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 80px 10px" }}>
          <FilterPresets
            presets={STARTUP_PRESETS}
            filters={filters as unknown as Record<string, unknown>}
            defaults={DEFAULT_FILTERS as unknown as Record<string, unknown>}
            onApply={(p) => patch(p as Partial<Filters>)}
          />
        </div>

        {/* Applied filters, each individually removable. Rendered only when
            something is applied, so the bar stays one quiet row by default. */}
        {activeCount > 0 && (
          <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 80px 10px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {filters.industries.map((ind) => (
              <AppliedChip key={`i-${ind}`} label={ind}
                onRemove={() => patch({ industries: filters.industries.filter(i => i !== ind) })} />
            ))}
            {filters.stages.map((st) => (
              <AppliedChip key={`s-${st}`} label={STAGES.find(x => x.value === st)?.label ?? st}
                onRemove={() => patch({ stages: filters.stages.filter(x => x !== st) })} />
            ))}
            {filters.mrrMin > 0 && (
              <AppliedChip label={MRR_PRESETS.find(m => m.value === filters.mrrMin)?.label ?? `MRR ${filters.mrrMin}+`}
                onRemove={() => patch({ mrrMin: 0 })} />
            )}
            {filters.aiScoreMin > 0 && (
              <AppliedChip label={SCORE_PRESETS.find(sc => sc.value === filters.aiScoreMin)?.label ?? `Score ${filters.aiScoreMin}+`}
                onRemove={() => patch({ aiScoreMin: 0 })} />
            )}
            {filters.newOnly && (
              <AppliedChip label={t("startups.newThisWeek")} onRemove={() => patch({ newOnly: false })} />
            )}
            {filters.country && (
              <AppliedChip label={filters.country} onRemove={() => patch({ country: "" })} />
            )}
            {(filters.raisingMin ?? 0) > 0 && (
              <AppliedChip label={RAISING_PRESETS.find(r => r.value === filters.raisingMin)?.label ?? "Raising+"}
                onRemove={() => patch({ raisingMin: 0 })} />
            )}
            {(filters.runwayMin ?? 0) > 0 && (
              <AppliedChip label={t("startups.runway12")} onRemove={() => patch({ runwayMin: 0 })} />
            )}
            {(filters.growthMin ?? 0) > 0 && (
              <AppliedChip label={t("startups.growth20")} onRemove={() => patch({ growthMin: 0 })} />
            )}
          </div>
        )}
      </div>

      {/* Click-away closes an open filter group. Sits under the sticky bar
          (z 40) so the bar's own controls stay directly clickable. */}
      {openGroup && (
        <div style={{ position: "fixed", inset: 0, zIndex: 39 }} onClick={() => setOpenGroup(null)} />
      )}

      {/* ── Content ── */}
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 80px 60px" }}>
        {/* Count + mobile sort */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>
            {loading ? t("common.loading") : t("listings.showing", { current: visible.length, total: filtered.length })}
            {!loading && filtered.length > 0 && (
              <span style={{ marginLeft: "10px", color: "var(--cr-ink-4)" }}>
                · {t("startups.sumRaising", { count: filtered.length, sum: formatCurrency(filtered.reduce((a, s) => a + (isValidFundingTarget(s.funding_target) ? s.funding_target : 0), 0), true) })}
              </span>
            )}
            {activeCount > 0 && (
              <button
                onClick={() => { navigator.clipboard.writeText(window.location.href); notify.success(t("startups.linkCopied2")); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", color: "var(--cr-copper)", textDecoration: "underline", textUnderlineOffset: "3px", marginLeft: "10px", padding: 0 }}>
                {t("startups.copyLink")}
              </button>
            )}
            {lastHidden && (
              <button
                onClick={() => { toggleHide(lastHidden.id); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", color: "var(--cr-copper)", textDecoration: "underline", textUnderlineOffset: "3px", marginLeft: "10px", padding: 0 }}>
                {lastHidden.name}: {t("startups.hiddenUndo")}
              </button>
            )}
            {dismissedIds.size > 0 && (
              <button onClick={() => { setShowHidden(v => !v); setPage(1); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", color: showHidden ? "var(--cr-copper)" : "var(--cr-ink-4)", textDecoration: "underline", textUnderlineOffset: "3px", marginLeft: "10px", padding: 0 }}>
                {showHidden ? t("startups.hidden") : t("startups.showHidden", { count: dismissedIds.size })}
              </button>
            )}
          </p>
          <button
            className="lg:hidden"
            onClick={() => setSortOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: "5px", background: "transparent", border: "1px solid var(--cr-rule)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", padding: "6px 12px", cursor: "pointer" }}>
            {sortLabel} <ChevronDown style={{ width: 12, height: 12 }} />
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: viewMode === "grid" ? "repeat(auto-fill, minmax(280px, 1fr))" : "1fr", gap: "16px" }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "grid" }}>
            <NoResults query={filters.query} hasFilters={activeCount > 0 || !!filters.query} onReset={resetFilters} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: viewMode === "grid" ? "repeat(auto-fill, minmax(280px, 1fr))" : "1fr", gap: "16px" }}>
            {visible.map((s) => (
              <ResultCard key={s.id} s={s} saved={savedIds.has(s.id)} viewed={viewedIds.has(s.id)} hidden={dismissedIds.has(s.id)} comparing={compareIds.includes(s.id)} match={myThesis ? computeMatchScore(myThesis, s).score : undefined} onSave={toggleSave} onHide={toggleHide} onCompare={toggleCompare} />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <div style={{ marginTop: "40px", display: "flex", justifyContent: "center" }}>
            <button onClick={() => setPage((p) => p + 1)}
              style={{ background: "transparent", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", padding: "10px 32px", borderRadius: "4px", border: "1px solid var(--cr-copper-br)", cursor: "pointer" }}>
              {t("startups.loadMore", { count: Math.min(PAGE_SIZE, filtered.length - visible.length) })}
            </button>
          </div>
        )}
        {!hasMore && !loading && filtered.length > 0 && (
          <p style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginTop: "40px" }}>
            {t("startups.allLoaded", { count: filtered.length })}
          </p>
        )}
      </div>

      {/* ── Compare tray + modal ── */}
      {/* The tray clears the mobile tab bar via --cr-tabbar-h, which is 0
          wherever no tab bar is on screen (desktop, or signed out). */}
      {compareIds.length > 0 && (
        <div style={{ position: "fixed", bottom: "calc(18px + var(--cr-tabbar-h, 0px))", left: "50%", transform: "translateX(-50%)", zIndex: 60, display: "flex", alignItems: "center", gap: "12px", background: "var(--cr-ink)", borderRadius: "6px", padding: "10px 14px", boxShadow: "0 10px 30px rgba(26,22,18,0.35)" }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "#EDE8DE" }}>
            {compareIds.map(id => allStartups.find(s => s.id === id)?.name).filter(Boolean).join(" · ")}
          </span>
          <button onClick={() => setShowCompare(true)} disabled={compareIds.length < 2}
            style={{ background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", color: "#fff", padding: "7px 14px", cursor: compareIds.length < 2 ? "default" : "pointer", opacity: compareIds.length < 2 ? 0.5 : 1 }}>
            {t("startups.compare")} ({compareIds.length})
          </button>
          <button onClick={() => setCompareIds([])} aria-label={t("startups.compareClear")}
            style={{ background: "none", border: "none", color: "#9C8E82", cursor: "pointer", display: "flex", padding: 0 }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}
      {showCompare && (() => {
        const rows = compareIds.map(id => allStartups.find(s => s.id === id)).filter((s): s is Startup => !!s);
        const METRICS: Array<{ label: string; get: (s: Startup) => string }> = [
          { label: t("listings.stage"),          get: (s) => STAGE_LABELS[s.stage] ?? s.stage },
          { label: t("onboarding.su.industry"),  get: (s) => s.industry },
          { label: t("startupDetail.mrr"),       get: (s) => safeFormatMRR(s.mrr) },
          { label: t("startupDetail.arr"),       get: (s) => safeFormatMRR(s.arr) },
          { label: t("startupDetail.growth"),    get: (s) => s.growth_rate ? `${s.growth_rate > 0 ? "+" : ""}${s.growth_rate}%` : "—" },
          { label: t("startups.runwayLabel"),    get: (s) => s.runway_months != null ? `${s.runway_months}mo` : "—" },
          { label: t("listings.raising"),        get: (s) => safeFormatCurrencyAmount(s.funding_target) },
          { label: t("dashboard.aiScore"),       get: (s) => s.vaultrise_score != null ? String(s.vaultrise_score) : "—" },
        ];
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 70 }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(26,22,18,0.5)" }} onClick={() => setShowCompare(false)} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(92vw, 760px)", maxHeight: "84vh", overflowY: "auto", background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "20px", color: "var(--cr-ink)" }}>{t("startups.compareTitle")}</h2>
                <button onClick={() => setShowCompare(false)} aria-label={t("nav.closeMenu")}
                  style={{ background: "none", border: "none", color: "var(--cr-ink-4)", cursor: "pointer", display: "flex" }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "120px" }} />
                      {rows.map(s => (
                        <th key={s.id} style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid var(--cr-copper)" }}>
                          <Link href={`/startups/${s.slug}`} style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", textDecoration: "none" }}>
                            {s.name}
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map(m => (
                      <tr key={m.label}>
                        <td style={{ padding: "9px 12px 9px 0", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid var(--cr-rule)" }}>{m.label}</td>
                        {rows.map(s => (
                          <td key={s.id} style={{ padding: "9px 12px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", borderBottom: "1px solid var(--cr-rule)" }}>{m.get(s)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Mobile filter bottom sheet ── */}
      {sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(26,22,18,0.4)" }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "var(--cr-paper-2)", borderRadius: "8px 8px 0 0", maxHeight: "75vh", overflowY: "auto" }}>
            <div style={{ width: 36, height: 4, background: "var(--cr-paper-4)", borderRadius: "2px", margin: "12px auto 20px" }} />
            <div style={{ padding: "0 20px 20px" }}>
              <div style={{ marginBottom: "24px" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>{t("filters.industry")}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {INDUSTRIES.map((ind) => (
                    <FilterChip key={ind} active={filters.industries.includes(ind)}
                      onClick={() => patch({ industries: filters.industries.includes(ind) ? filters.industries.filter(i => i !== ind) : [...filters.industries, ind] })}>
                      {ind}
                    </FilterChip>
                  ))}
                </div>
              </div>
              <div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>{t("filters.stage")}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {STAGES.map((s) => (
                    <FilterChip key={s.value} active={filters.stages.includes(s.value)}
                      onClick={() => patch({ stages: filters.stages.includes(s.value) ? filters.stages.filter(x => x !== s.value) : [...filters.stages, s.value] })}>
                      {s.label}
                    </FilterChip>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: "0 20px 20px" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>{t("filters.thresholds")}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {MRR_PRESETS.map((m) => (
                  <FilterChip key={m.value} active={filters.mrrMin === m.value}
                    onClick={() => patch({ mrrMin: filters.mrrMin === m.value ? 0 : m.value })}>
                    {m.label}
                  </FilterChip>
                ))}
                {SCORE_PRESETS.map((sc) => (
                  <FilterChip key={sc.value} active={filters.aiScoreMin === sc.value}
                    onClick={() => patch({ aiScoreMin: filters.aiScoreMin === sc.value ? 0 : sc.value })}>
                    {sc.label}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div style={{ position: "sticky", bottom: 0, background: "var(--cr-paper-2)", borderTop: "1px solid var(--cr-rule)", padding: "14px 20px", display: "flex", gap: "10px" }}>
              <button onClick={resetFilters}
                style={{ flex: 1, height: "44px", background: "transparent", border: "1px solid var(--cr-paper-4)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
                {t("filters.reset")}
              </button>
              <button onClick={() => setSidebarOpen(false)}
                className="btn-copper-shimmer"
                style={{ flex: 1, height: "44px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#fff", cursor: "pointer" }}>
                {t("filters.apply")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
