"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Search, SlidersHorizontal, X, LayoutGrid, List, ChevronDown, Bookmark, Eye, EyeOff } from "lucide-react";
import { formatCurrency, getInitials, STAGE_LABELS } from "@/lib/utils";
import { notify } from "@/components/ui/toast-notify";
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

const SORT_OPTIONS = [
  { value: "score",   label: "AI Score"      },
  { value: "recent",  label: "Newest"         },
  { value: "mrr",     label: "Highest MRR"   },
  { value: "funding", label: "Funding Target" },
];

const PAGE_SIZE = 24;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Startup {
  id: string; slug: string; name: string; tagline: string;
  industry: string; stage: string; funding_target: number;
  mrr: number | null; arr: number | null; growth_rate: number | null;
  runway_months: number | null; featured: boolean; created_at: string;
  vaultrise_score: number | null;
  country: string | null; business_model: string | null;
}

interface Filters {
  query: string; industries: string[]; stages: string[];
  mrrMin: number; aiScoreMin: number; sort: string; country: string;
  newOnly?: boolean;
}

const DEFAULT_FILTERS: Filters = {
  query: "", industries: [], stages: [],
  mrrMin: 0, aiScoreMin: 0, sort: "score", country: "", newOnly: false,
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
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: "280px", maxWidth: "min(90vw, 420px)", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", boxShadow: "0 8px 24px rgba(26,22,18,0.12)", padding: "12px", display: "flex", flexWrap: "wrap", gap: "6px", zIndex: 50 }}>
          {children}
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

function EmptyState({ query, hasFilters, onReset }: { query: string; hasFilters: boolean; onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
      <Search style={{ width: 36, height: 36, color: "var(--cr-ink-4)", marginBottom: "16px" }} />
      <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "18px", color: "var(--cr-ink)", marginBottom: "8px" }}>
        {query ? `${t("startups.noResults")} "${query}"` : t("startups.noListings")}
      </h3>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", marginBottom: "24px" }}>
        {hasFilters ? t("startups.noResults") : t("startups.noListings")}
      </p>
      {hasFilters && (
        <button onClick={onReset} style={{
          background: "transparent", color: "var(--cr-ink-3)",
          fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
          padding: "8px 20px", borderRadius: "4px", border: "1px solid var(--cr-paper-4)",
          cursor: "pointer",
        }}>
          {t("filters.clearAll")}
        </button>
      )}
    </div>
  );
}

// ── Search result card ────────────────────────────────────────────────────────

function ResultCard({ s, saved, viewed, hidden, onSave, onHide }: { s: Startup; saved: boolean; viewed?: boolean; hidden?: boolean; onSave: (id: string) => void; onHide?: (id: string) => void }) {
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
            { label: t("startupDetail.mrr"),    val: s.mrr         ? formatCurrency(s.mrr, true)                                : null },
            { label: t("startupDetail.arr"),    val: s.arr         ? formatCurrency(s.arr, true)                                : null },
            { label: t("startupDetail.growth"), val: s.growth_rate != null ? `${s.growth_rate >= 0 ? "+" : ""}${s.growth_rate}%` : null, isGrowth: true, positiveGrowth: (s.growth_rate ?? 0) >= 0 },
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
              {formatCurrency(s.funding_target, true)}
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
    sort:       searchParams.get("sort") ?? DEFAULT_FILTERS.sort,
  };

  const [filters, setFilters]         = useState<Filters>(initialFilters);
  const [viewMode, setViewMode]       = useState<"grid" | "list">("grid");
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
  const [sortOpen, setSortOpen]       = useState(false);
  // Typeahead: name matches from the already-loaded list, so suggestions are
  // instant and need no network round trip or debounce.
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<null | "industry" | "stage" | "traction">(null);
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
      const { data: inv } = await supabase.from("investors").select("id").eq("owner_id", user.id).maybeSingle();
      myInvestorId.current = inv?.id ?? null;
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

  const filtered = useMemo(() => {
    let res = allStartups.filter((s) => {
      const q     = filters.query.toLowerCase();
      const score = s.vaultrise_score ?? 0;
      if (q && !s.name.toLowerCase().includes(q) && !s.tagline.toLowerCase().includes(q)) return false;
      if (filters.industries.length && !filters.industries.includes(s.industry)) return false;
      if (filters.stages.length && !filters.stages.includes(s.stage)) return false;
      if (filters.mrrMin > 0 && (s.mrr ?? 0) < filters.mrrMin) return false;
      if (filters.aiScoreMin > 0 && score < filters.aiScoreMin) return false;
      if (filters.country && !(s.country ?? "").toLowerCase().includes(filters.country.toLowerCase())) return false;
      if (filters.newOnly && (Date.now() - new Date(s.created_at).getTime()) / 86400000 > 7) return false;
      if (!showHidden && dismissedIds.has(s.id)) return false;
      if (showHidden && !dismissedIds.has(s.id)) return false;
      return true;
    });

    switch (filters.sort) {
      case "score":   res = [...res].sort((a, b) => ((b.vaultrise_score ?? 0) - (a.vaultrise_score ?? 0))); break;
      case "mrr":     res = [...res].sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0)); break;
      case "recent":  res = [...res].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case "funding": res = [...res].sort((a, b) => b.funding_target - a.funding_target); break;
    }
    return res;
  }, [filters, allStartups, dismissedIds, showHidden]);

  const visible    = filtered.slice(0, page * PAGE_SIZE);
  const hasMore    = visible.length < filtered.length;
  const activeCount = [
    filters.industries.length, filters.stages.length,
    filters.mrrMin > 0 ? 1 : 0, filters.aiScoreMin > 0 ? 1 : 0,
    filters.country ? 1 : 0,
    filters.newOnly ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

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
    if (hidden) {
      await supabase.from("startup_dismissals").delete().eq("investor_id", inv).eq("startup_id", id);
    } else {
      await supabase.from("startup_dismissals").upsert(
        { investor_id: inv, startup_id: id }, { onConflict: "investor_id,startup_id" });
    }
  }

  const sortLabel = SORT_OPTIONS.find((o) => o.value === filters.sort)?.label ?? t("filters.sort");

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
                    {SORT_OPTIONS.map((o) => (
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
                  <button key={v} onClick={() => setViewMode(v)}
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
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "10px 80px", display: "flex", alignItems: "center", gap: "8px", overflowX: "auto" }}>
          {/* Search */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Search style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--cr-ink-4)" }} />
            <input
              ref={searchRef}
              type="text"
              value={filters.query}
              onChange={(e) => { patch({ query: e.target.value }); setSuggestOpen(true); }}
              onKeyDown={(e) => { if (e.key === "Escape") setSuggestOpen(false); }}
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
            {suggestOpen && suggestions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: "280px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", boxShadow: "0 8px 24px rgba(26,22,18,0.12)", overflow: "hidden", zIndex: 50 }}>
                {suggestions.map((s) => (
                  <Link key={s.id} href={`/startups/${s.slug}`}
                    style={{ display: "flex", flexDirection: "column", gap: "1px", padding: "9px 12px", textDecoration: "none", borderBottom: "1px solid var(--cr-rule)" }}
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
            {INDUSTRIES.map((ind) => (
              <FilterChip key={ind}
                active={filters.industries.includes(ind)}
                onClick={() => patch({ industries: filters.industries.includes(ind) ? filters.industries.filter(i => i !== ind) : [...filters.industries, ind] })}>
                {ind}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup label={t("startups.stageGroup")} count={filters.stages.length}
            open={openGroup === "stage"} onToggle={() => setOpenGroup(openGroup === "stage" ? null : "stage")}>
            {STAGES.map((s) => (
              <FilterChip key={s.value}
                active={filters.stages.includes(s.value)}
                onClick={() => patch({ stages: filters.stages.includes(s.value) ? filters.stages.filter(x => x !== s.value) : [...filters.stages, s.value] })}>
                {s.label}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup label={t("startups.traction")}
            count={(filters.mrrMin > 0 ? 1 : 0) + (filters.aiScoreMin > 0 ? 1 : 0) + (filters.newOnly ? 1 : 0)}
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
            <EmptyState query={filters.query} hasFilters={activeCount > 0 || !!filters.query} onReset={resetFilters} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: viewMode === "grid" ? "repeat(auto-fill, minmax(280px, 1fr))" : "1fr", gap: "16px" }}>
            {visible.map((s) => (
              <ResultCard key={s.id} s={s} saved={savedIds.has(s.id)} viewed={viewedIds.has(s.id)} hidden={dismissedIds.has(s.id)} onSave={toggleSave} onHide={toggleHide} />
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
