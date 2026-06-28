"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Search, SlidersHorizontal, X, LayoutGrid, List, ChevronDown, Bookmark } from "lucide-react";
import { formatCurrency, getInitials, STAGE_LABELS } from "@/lib/utils";
import { notify } from "@/components/ui/toast-notify";
import Link from "next/link";

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
  ai_score: number | null; vaultrise_score: number | null;
  country: string | null; business_model: string | null;
}

interface Filters {
  query: string; industries: string[]; stages: string[];
  mrrMin: number; aiScoreMin: number; sort: string; country: string;
}

const DEFAULT_FILTERS: Filters = {
  query: "", industries: [], stages: [],
  mrrMin: 0, aiScoreMin: 0, sort: "score", country: "",
};

// ── Primitives ────────────────────────────────────────────────────────────────

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

function ScoreRing({ score }: { score: number | null }) {
  if (!score) return null;
  const size  = 36;
  const sw    = 3;
  const r     = size / 2 - sw;
  const c     = size / 2;
  const circ  = 2 * Math.PI * r;
  const dash  = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }} title={`AI Score: ${score}`}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--cr-paper-4)" strokeWidth={sw} />
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--cr-copper)" strokeWidth={sw}
          strokeLinecap="square" strokeDasharray={`${dash} ${circ}`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "9px", color: "var(--cr-copper)" }}>{score}</span>
      </div>
    </div>
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
  return (
    <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
      <Search style={{ width: 36, height: 36, color: "var(--cr-ink-4)", marginBottom: "16px" }} />
      <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "18px", color: "var(--cr-ink)", marginBottom: "8px" }}>
        {query ? `No results for "${query}"` : "No startups found"}
      </h3>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-3)", marginBottom: "24px" }}>
        {hasFilters ? "Try adjusting your filters." : "No startups are currently listed."}
      </p>
      {hasFilters && (
        <button onClick={onReset} style={{
          background: "transparent", color: "var(--cr-ink-3)",
          fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px",
          padding: "8px 20px", borderRadius: "4px", border: "1px solid var(--cr-paper-4)",
          cursor: "pointer",
        }}>
          Clear filters
        </button>
      )}
    </div>
  );
}

// ── Search result card ────────────────────────────────────────────────────────

function ResultCard({ s, saved, onSave }: { s: Startup; saved: boolean; onSave: (id: string) => void }) {
  const score = s.ai_score ?? s.vaultrise_score ?? null;
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
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.name}
            </p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.tagline}
            </p>
          </div>
          <ScoreRing score={score} />
        </div>

        {/* Badges */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
          <span style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {s.industry}
          </span>
          <span style={{ background: "var(--cr-paper-4)", border: "1px solid var(--cr-rule)", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "10px", borderRadius: "3px", padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {STAGE_LABELS[s.stage] ?? s.stage}
          </span>
          {isNew && (
            <span style={{ background: "var(--cr-up-bg)", border: "1px solid rgba(45,106,79,0.25)", color: "var(--cr-up)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", borderRadius: "3px", padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              New
            </span>
          )}
        </div>

        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
          {[
            { label: "MRR",    val: s.mrr         ? formatCurrency(s.mrr, true)                                : null },
            { label: "ARR",    val: s.arr         ? formatCurrency(s.arr, true)                                : null },
            { label: "Growth", val: s.growth_rate != null ? `${s.growth_rate >= 0 ? "+" : ""}${s.growth_rate}%` : null, isGrowth: true, positiveGrowth: (s.growth_rate ?? 0) >= 0 },
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
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>Raising</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", color: "var(--cr-copper)" }}>
              {formatCurrency(s.funding_target, true)}
            </div>
          </div>
          {s.runway_months != null && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)" }}>
              {s.runway_months}mo runway
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function StartupsSearch() {
  const searchParams  = useSearchParams();
  const initialQuery  = searchParams.get("q") ?? "";

  const [filters, setFilters]         = useState<Filters>({ ...DEFAULT_FILTERS, query: initialQuery });
  const [viewMode, setViewMode]       = useState<"grid" | "list">("grid");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allStartups, setAllStartups] = useState<Startup[]>([]);
  const [loading, setLoading]         = useState(true);
  const [page, setPage]               = useState(1);
  const [savedIds, setSavedIds]       = useState<Set<string>>(new Set());
  const [sortOpen, setSortOpen]       = useState(false);
  const supabase = useRef(createClient()).current;

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
  }, []);

  const filtered = useMemo(() => {
    let res = allStartups.filter((s) => {
      const q     = filters.query.toLowerCase();
      const score = s.ai_score ?? s.vaultrise_score ?? 0;
      if (q && !s.name.toLowerCase().includes(q) && !s.tagline.toLowerCase().includes(q)) return false;
      if (filters.industries.length && !filters.industries.includes(s.industry)) return false;
      if (filters.stages.length && !filters.stages.includes(s.stage)) return false;
      if (filters.mrrMin > 0 && (s.mrr ?? 0) < filters.mrrMin) return false;
      if (filters.aiScoreMin > 0 && score < filters.aiScoreMin) return false;
      if (filters.country && !(s.country ?? "").toLowerCase().includes(filters.country.toLowerCase())) return false;
      return true;
    });

    switch (filters.sort) {
      case "score":   res = [...res].sort((a, b) => ((b.ai_score ?? b.vaultrise_score ?? 0) - (a.ai_score ?? a.vaultrise_score ?? 0))); break;
      case "mrr":     res = [...res].sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0)); break;
      case "recent":  res = [...res].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case "funding": res = [...res].sort((a, b) => b.funding_target - a.funding_target); break;
    }
    return res;
  }, [filters, allStartups]);

  const visible    = filtered.slice(0, page * PAGE_SIZE);
  const hasMore    = visible.length < filtered.length;
  const activeCount = [
    filters.industries.length, filters.stages.length,
    filters.mrrMin > 0 ? 1 : 0, filters.aiScoreMin > 0 ? 1 : 0,
    filters.country ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const patch = useCallback((delta: Partial<Filters>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...delta }));
  }, []);

  const resetFilters = useCallback(() => { setFilters(DEFAULT_FILTERS); setPage(1); }, []);

  function toggleSave(id: string) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); notify.info("Removed from watchlist"); }
      else { next.add(id); notify.success("Saved to watchlist"); }
      return next;
    });
  }

  const sortLabel = SORT_OPTIONS.find((o) => o.value === filters.sort)?.label ?? "Sort";

  return (
    <div style={{ background: "var(--cr-paper)", minHeight: "100vh" }}>

      {/* ── Page header ── */}
      <div style={{ borderBottom: "1px solid var(--cr-rule)", padding: "48px 80px 32px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div className="ruled-label" style={{ marginBottom: "12px" }}>Deal Flow</div>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(32px, 4vw, 48px)", color: "var(--cr-ink)", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "10px" }}>
                Active fundraising rounds
              </h1>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)" }}>
                {loading ? "Loading startups…" : allStartups.length > 0
                  ? `${allStartups.length.toLocaleString()} vetted startup${allStartups.length !== 1 ? "s" : ""} currently raising`
                  : "Vetted startups currently raising capital"}
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

      {/* ── Sticky filter bar ── */}
      <div style={{ position: "sticky", top: "56px", zIndex: 40, background: "var(--cr-paper)", borderBottom: "1px solid var(--cr-rule-dark)" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "10px 80px", display: "flex", alignItems: "center", gap: "8px", overflowX: "auto" }}>
          {/* Search */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Search style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--cr-ink-4)" }} />
            <input
              type="text"
              value={filters.query}
              onChange={(e) => patch({ query: e.target.value })}
              placeholder="Search startups…"
              style={{
                background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
                borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400,
                fontSize: "13px", color: "var(--cr-ink)", paddingLeft: "32px", paddingRight: "12px",
                paddingTop: "7px", paddingBottom: "7px", width: "200px", outline: "none",
              }}
              onFocus={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
              onBlur={e  => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}
            />
          </div>

          <div style={{ width: 1, height: 20, background: "var(--cr-rule-dark)", flexShrink: 0 }} />

          {/* Industry chips */}
          {INDUSTRIES.slice(0, 6).map((ind) => (
            <FilterChip key={ind}
              active={filters.industries.includes(ind)}
              onClick={() => patch({ industries: filters.industries.includes(ind) ? filters.industries.filter(i => i !== ind) : [...filters.industries, ind] })}>
              {ind}
            </FilterChip>
          ))}

          {/* Stage chips */}
          {STAGES.map((s) => (
            <FilterChip key={s.value}
              active={filters.stages.includes(s.value)}
              onClick={() => patch({ stages: filters.stages.includes(s.value) ? filters.stages.filter(x => x !== s.value) : [...filters.stages, s.value] })}>
              {s.label}
            </FilterChip>
          ))}

          {/* Mobile filter btn */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden"
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", padding: "7px 14px", cursor: "pointer", flexShrink: 0 }}
          >
            <SlidersHorizontal style={{ width: 13, height: 13 }} />
            Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>

          {/* Clear */}
          {(activeCount > 0 || filters.query) && (
            <button onClick={resetFilters}
              style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "1px solid var(--cr-paper-4)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-4)", padding: "6px 10px", cursor: "pointer", flexShrink: 0 }}>
              <X style={{ width: 11, height: 11 }} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 80px 60px" }}>
        {/* Count + mobile sort */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>
            {loading ? "Loading…" : `Showing ${visible.length.toLocaleString()} of ${filtered.length.toLocaleString()} startups`}
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
              <ResultCard key={s.id} s={s} saved={savedIds.has(s.id)} onSave={toggleSave} />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <div style={{ marginTop: "40px", display: "flex", justifyContent: "center" }}>
            <button onClick={() => setPage((p) => p + 1)}
              style={{ background: "transparent", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", padding: "10px 32px", borderRadius: "4px", border: "1px solid var(--cr-copper-br)", cursor: "pointer" }}>
              Load {Math.min(PAGE_SIZE, filtered.length - visible.length)} more startups
            </button>
          </div>
        )}
        {!hasMore && !loading && filtered.length > 0 && (
          <p style={{ textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginTop: "40px" }}>
            All {filtered.length.toLocaleString()} startups loaded
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
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>Industry</p>
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
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>Stage</p>
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
            <div style={{ position: "sticky", bottom: 0, background: "var(--cr-paper-2)", borderTop: "1px solid var(--cr-rule)", padding: "14px 20px", display: "flex", gap: "10px" }}>
              <button onClick={resetFilters}
                style={{ flex: 1, height: "44px", background: "transparent", border: "1px solid var(--cr-paper-4)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "14px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
                Reset
              </button>
              <button onClick={() => setSidebarOpen(false)}
                style={{ flex: 1, height: "44px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px", color: "#fff", cursor: "pointer" }}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
