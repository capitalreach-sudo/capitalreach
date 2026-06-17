"use client";

import { useState, useEffect, useCallback, useRef, memo } from "react";
import { createClient } from "@/lib/supabase";
import { StartupCard } from "./startup-card";
import { FiltersSidebar, type FilterState, DEFAULT_FILTERS } from "./filters-sidebar";
import { AiSidePanel } from "@/components/shared/ai-side-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search, Loader2, ChevronLeft, ChevronRight,
  Flame, Sparkles, LayoutGrid, List, SlidersHorizontal, X, Brain
} from "lucide-react";
import type { Startup, SubscriptionTier } from "@/types";
import { useDebounce } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

const STAGE_LABELS: Record<string, string> = {
  pre_seed: "Pre-Seed", seed: "Seed", series_a: "Series A", series_b: "Series B",
};

interface MarketplaceFeedProps {
  investorTier: SubscriptionTier | null;
  investorId: string | null;
  searchParams: { [key: string]: string | undefined };
  featuredStartups: Startup[];
  newStartups: Startup[];
}

export function MarketplaceFeed({ investorTier, investorId, featuredStartups, newStartups }: MarketplaceFeedProps) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [startups, setStartups] = useState<Startup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 350);
  // useRef keeps the same client instance across renders — prevents infinite loop
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const fetchStartups = useCallback(async () => {
    // Immediately bail to demo mode if Supabase isn't configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!supabaseUrl || supabaseUrl.includes("placeholder") || supabaseUrl === "https://placeholder.supabase.co") {
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      let q = supabase
        .from("startups")
        .select("*", { count: "exact" })
        .eq("status", "active")
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        .abortSignal(controller.signal);

      if (debouncedQuery) q = q.textSearch("name, tagline, industry", debouncedQuery, { type: "websearch" });
      if (filters.industries.length > 0) q = q.in("industry", filters.industries);
      if (filters.stages.length > 0) q = q.in("stage", filters.stages);
      if (filters.fundingMin > 0) q = q.gte("funding_target", filters.fundingMin);
      if (filters.fundingMax < 10_000_000) q = q.lte("funding_target", filters.fundingMax);
      if (filters.mrrMin > 0) q = q.gte("mrr", filters.mrrMin);
      if (filters.mrrMax < 500_000) q = q.lte("mrr", filters.mrrMax);
      if (filters.country) q = q.ilike("country", `%${filters.country}%`);
      if (filters.aiScoreMin > 0) q = q.gte("vaultrise_score", filters.aiScoreMin);
      if (filters.featuredOnly) q = q.eq("featured", true);
      if (filters.revenueStatus === "has_revenue") q = q.gt("mrr", 0);
      if (filters.revenueStatus === "pre_revenue") q = q.or("mrr.is.null,mrr.eq.0");
      if (filters.sort === "recent") q = q.order("created_at", { ascending: false });
      else if (filters.sort === "views") q = q.order("pageviews", { ascending: false });
      else if (filters.sort === "score") q = q.order("vaultrise_score", { ascending: false });
      else q = q.order("created_at", { ascending: false });

      const { data, count, error } = await q;
      clearTimeout(timer);
      if (!error) {
        setStartups((data as Startup[]) || []);
        setTotal(count || 0);
      }
    } catch { /* DB not connected or timed out */ }
    setLoading(false);
  }, [debouncedQuery, filters, page]);

  useEffect(() => { fetchStartups(); }, [fetchStartups]);

  useEffect(() => {
    if (!investorId) return;
    supabase.from("watchlists").select("startup_id").eq("investor_id", investorId)
      .then(({ data }) => { if (data) setSavedIds(new Set(data.map(w => w.startup_id))); });
  }, [investorId]);

  async function handleSave(startupId: string) {
    if (!investorId) return;
    if (savedIds.has(startupId)) {
      await supabase.from("watchlists").delete().match({ investor_id: investorId, startup_id: startupId });
      setSavedIds(prev => { const s = new Set(prev); s.delete(startupId); return s; });
    } else {
      await supabase.from("watchlists").insert({ investor_id: investorId, startup_id: startupId });
      setSavedIds(prev => new Set(Array.from(prev).concat(startupId)));
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const showEmpty = !loading && startups.length === 0;
  const gridClass = viewMode === "grid"
    ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
    : "grid grid-cols-1 gap-3";

  // Compute active filter chips
  const activeChips: { label: string; clear: () => void }[] = [];
  filters.industries.forEach(ind => activeChips.push({ label: ind, clear: () => setFilters(f => ({ ...f, industries: f.industries.filter(x => x !== ind) })) }));
  filters.stages.forEach(s => activeChips.push({ label: STAGE_LABELS[s] || s, clear: () => setFilters(f => ({ ...f, stages: f.stages.filter(x => x !== s) })) }));
  if (filters.featuredOnly) activeChips.push({ label: "⭐ Featured", clear: () => setFilters(f => ({ ...f, featuredOnly: false })) });
  if (filters.aiScoreMin > 0) activeChips.push({ label: `⚡ Score ${filters.aiScoreMin}+`, clear: () => setFilters(f => ({ ...f, aiScoreMin: 0 })) });
  if (filters.revenueStatus === "has_revenue") activeChips.push({ label: "💰 Has Revenue", clear: () => setFilters(f => ({ ...f, revenueStatus: "all" })) });
  if (filters.revenueStatus === "pre_revenue") activeChips.push({ label: "🌱 Pre-Revenue", clear: () => setFilters(f => ({ ...f, revenueStatus: "all" })) });
  if (filters.country) activeChips.push({ label: `📍 ${filters.country}`, clear: () => setFilters(f => ({ ...f, country: "" })) });
  if (filters.mrrMin > 0) activeChips.push({ label: `MRR $${(filters.mrrMin / 1000).toFixed(0)}K+`, clear: () => setFilters(f => ({ ...f, mrrMin: 0 })) });

  return (
    <div className="flex gap-6 items-start relative">

      {/* ── Left filter sidebar ─────────────────────────────────────── */}
      <div className={cn(
        "w-52 flex-shrink-0 hidden lg:block",
        sidebarOpen && "!block fixed inset-y-0 left-0 z-50 w-72 bg-cr-paper shadow-2xl overflow-y-auto p-4 pt-16"
      )}>
        {sidebarOpen && (
          <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 text-cr-i4 hover:text-cr-i2">
            <X className="h-5 w-5" />
          </button>
        )}
        <FiltersSidebar filters={filters} onChange={f => { setFilters(f); setPage(0); }} />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Centre: startup cards ───────────────────────────────────── */}
      <div className="flex-1 min-w-0">

        {/* Search + controls bar */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cr-i4" />
            <Input
              className="pl-10 h-11 text-[14px] border-cr-p4 focus:border-cr-copper rounded-xl"
              placeholder="Search startups by name, industry, keywords…"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(0); }}
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-cr-i4 hover:text-cr-i3">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Mobile: Filters button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn(
              "lg:hidden inline-flex items-center gap-1.5 h-11 px-3.5 rounded-xl border text-sm font-medium transition-colors relative",
              activeChips.length > 0 ? "bg-cr-cu-d text-white border-cr-cu-d" : "border-cr-p4 text-cr-i3 hover:border-cr-copper/40"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeChips.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-cr-paper text-cr-cu-l text-[10px] font-black rounded-full border border-cr-copper/30 flex items-center justify-center">
                {activeChips.length}
              </span>
            )}
          </button>

          {/* Mobile: AI panel button (hidden on lg+ where panel is always visible) */}
          <button
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            className="lg:hidden inline-flex items-center gap-1.5 h-11 px-3.5 rounded-xl border border-cr-copper/30 text-sm font-medium text-cr-copper bg-cr-copper/10 hover:bg-cr-copper/15 transition-colors"
          >
            <Brain className="h-4 w-4" />
            AI
          </button>

          {/* View toggle */}
          <div className="hidden sm:flex items-center border border-cr-p4 rounded-xl overflow-hidden">
            <button onClick={() => setViewMode("grid")}
              className={cn("h-11 w-11 flex items-center justify-center transition-colors", viewMode === "grid" ? "bg-cr-cu-d text-white" : "text-cr-i4 hover:bg-cr-p2")}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode("list")}
              className={cn("h-11 w-11 flex items-center justify-center transition-colors", viewMode === "list" ? "bg-cr-cu-d text-white" : "text-cr-i4 hover:bg-cr-p2")}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {activeChips.map((chip, i) => (
              <button
                key={i}
                onClick={chip.clear}
                className="inline-flex items-center gap-1.5 text-xs bg-cr-copper/10 text-cr-cu-l border border-cr-copper/30 rounded-full px-2.5 py-1 font-medium hover:bg-cr-copper/15 transition-colors"
              >
                {chip.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <button
              onClick={() => { setFilters(DEFAULT_FILTERS); setQuery(""); setPage(0); }}
              className="text-xs text-cr-i4 hover:text-red-500 font-medium px-2 transition-colors"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Mobile AI panel */}
        {aiPanelOpen && (
          <div className="lg:hidden mb-4 bg-cr-paper rounded-2xl border border-cr-p4 shadow-lg p-4 relative">
            <button onClick={() => setAiPanelOpen(false)} className="absolute top-3 right-3 text-cr-i4 hover:text-cr-i3">
              <X className="h-4 w-4" />
            </button>
            <AiSidePanel />
          </div>
        )}

        {/* Spotlight */}
        {featuredStartups.length > 0 && page === 0 && !query && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-cr-copper" />
              <h2 className="font-bold text-cr-ink">Spotlight</h2>
              <Badge className="text-[10px] bg-cr-copper/10 text-cr-copper border-cr-copper/20">{featuredStartups.length}</Badge>
            </div>
            <div className={gridClass}>
              {featuredStartups.slice(0, 2).map(s => (
                <StartupCard key={s.id} startup={s as any} investorTier={investorTier}
                  isSaved={savedIds.has(s.id)} onSave={investorId ? handleSave : undefined} />
              ))}
            </div>
          </section>
        )}

        {/* New This Week */}
        {newStartups.length > 0 && page === 0 && !query && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="h-4 w-4 text-orange-500" />
              <h2 className="font-bold text-cr-ink">New This Week</h2>
              <Badge variant="outline" className="text-[10px]">{newStartups.length}</Badge>
            </div>
            <div className={gridClass}>
              {newStartups.map(s => (
                <StartupCard key={s.id} startup={s as any} investorTier={investorTier}
                  isSaved={savedIds.has(s.id)} onSave={investorId ? handleSave : undefined} />
              ))}
            </div>
          </section>
        )}

        {/* Section header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-cr-ink text-[15px]">
            All Startups <span className="text-cr-i4 font-normal text-sm">({total})</span>
          </h2>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-cr-i4 gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-cr-copper" />
            <p className="text-sm">Loading startups…</p>
          </div>
        ) : showEmpty ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 bg-cr-p3 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search className="h-6 w-6 text-cr-i4" />
            </div>
            {debouncedQuery || filters.industries.length > 0 || filters.stages.length > 0 ? (
              <>
                <p className="font-semibold text-cr-i2 mb-1">No startups match your filters</p>
                <p className="text-sm text-cr-i4 mb-4">Try broadening your search or clearing your filters.</p>
                <button onClick={() => { setFilters(DEFAULT_FILTERS); setQuery(""); }}
                  className="text-sm text-cr-copper hover:underline font-medium">
                  Clear all filters
                </button>
              </>
            ) : (
              <>
                <p className="font-semibold text-cr-i2 mb-1">No startups listed yet</p>
                <p className="text-sm text-cr-i4 mb-4">Be the first to list your startup and connect with investors.</p>
                <a href="/auth/signup?role=startup"
                  className="inline-flex items-center gap-2 bg-cr-cu-d text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-cr-cu-l transition-colors">
                  List Your Startup →
                </a>
              </>
            )}
          </div>
        ) : (
          <>
            <div className={cn(gridClass, "mb-6")}>
              {startups.map(s => (
                <StartupCard key={s.id} startup={s as any} investorTier={investorTier}
                  isSaved={savedIds.has(s.id)} onSave={investorId ? handleSave : undefined} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded-xl">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => (
                    <button key={i} onClick={() => setPage(i)}
                      className={cn("w-8 h-8 rounded-lg text-sm font-medium transition-colors",
                        page === i ? "bg-cr-cu-d text-white" : "text-cr-i3 hover:bg-cr-p3")}>
                      {i + 1}
                    </button>
                  ))}
                </div>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="rounded-xl">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Right: AI side panel (desktop lg+) ─────────────────────── */}
      <div className="w-56 flex-shrink-0 hidden lg:block">
        <AiSidePanel />
      </div>
    </div>
  );
}
