"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { announce } from "@/lib/announce";
import {
  Search, SlidersHorizontal, X, ChevronDown, ChevronUp,
  Users, Globe, Filter, Loader2, Crosshair, GitCompareArrows, Clock,
} from "lucide-react";
import { INDUSTRIES, STAGES } from "@/types";
import { cn, STAGE_LABELS } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import { notify } from "@/components/ui/toast-notify";
import { INVESTOR_PRESETS } from "@/lib/search-presets";
import { FilterPresets } from "@/components/search/filter-presets";
import { EmptyState } from "@/components/ui/EmptyState";

const TYPE_META: Record<string, { labelKey: string; color: string; bg: string; border: string }> = {
  angel:         { labelKey: "investors.typeAngel",        color: "text-blue-300",   bg: "bg-blue-500/10",   border: "border-blue-500/30"   },
  vc:            { labelKey: "investors.typeVc",           color: "text-cr-cu-l",  bg: "bg-cr-copper/10",  border: "border-cr-copper/30"  },
  family_office: { labelKey: "investors.typeFamilyOffice", color: "text-amber-300",  bg: "bg-amber-500/10",  border: "border-amber-500/30"  },
  corporate:     { labelKey: "investors.typeCorporate",    color: "text-rose-300",   bg: "bg-rose-500/10",   border: "border-rose-500/30"   },
};

// Canonical stage labels from lib/utils -- the local copy had the wrong
// keys and rendered raw enums for pre-seed and series_b_plus.

const GRAD_COLORS = [
  "from-cr-cu-l to-blue-600",
  "from-blue-400 to-cyan-500",
  "from-emerald-400 to-teal-500",
  "from-amber-400 to-orange-500",
  "from-slate-500 to-gray-600",
  "from-pink-400 to-rose-500",
  "from-teal-400 to-cyan-500",
  "from-orange-400 to-red-500",
  "from-green-400 to-emerald-600",
  "from-red-400 to-rose-500",
  "from-cr-copper to-purple-700",
  "from-blue-500 to-blue-700",
];

function formatCheck(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function AppliedChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cr-copper bg-cr-copper/10 border border-cr-copper/30 rounded px-2 py-0.5">
      {label}
      <button onClick={onRemove} aria-label={`remove ${label}`} className="flex items-center text-inherit">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function Section({ title, count = 0, children, defaultOpen = true }: { title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between py-1 mb-2 group">
        <p className="text-xs font-bold text-cr-i4 uppercase tracking-wide group-hover:text-cr-i2 transition-colors">
          {title}{count > 0 && <span className="text-cr-copper normal-case tracking-normal"> · {count}</span>}
        </p>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-cr-i4" /> : <ChevronDown className="h-3.5 w-3.5 text-cr-i4" />}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

interface Investor {
  id: string;
  slug: string;
  type: string;
  bio: string | null;
  industries: string[];
  stages: string[];
  min_check: number | null;
  lead_rounds?: boolean;
  created_at?: string;
  max_check: number | null;
  geography: string[];
  subscription_tier: string | null;
  full_name: string | null;
  firm?: string | null;
}

interface InvestorFilters {
  query: string;
  types: string[];
  industries: string[];
  stages: string[];
  minCheck: number;
  maxCheck: number;
  geographies: string[];
  leadOnly: boolean;
  verifiedOnly: boolean;
  fitOnly: boolean;
  newOnly: boolean;
  sort: "recent" | "check_asc" | "check_desc" | "name" | "fit";
}

const DEFAULT: InvestorFilters = {
  query: "", types: [], industries: [], stages: [],
  minCheck: 0, maxCheck: 100_000_000, geographies: [], leadOnly: false, verifiedOnly: false, fitOnly: false, newOnly: false, sort: "recent",
};

export function InvestorsClient() {
  const { t } = useTranslation();
  // /investors?q= mirrors /startups?q= so the global search's "see all" can
  // land on either directory pre-filtered.
  const sp = useSearchParams();
  // Full filter set lives in the URL, exactly like the startups directory:
  // shareable, bookmarkable, back/forward-safe.
  const [f, setF] = useState<InvestorFilters>({
    ...DEFAULT,
    query:        sp.get("q") ?? "",
    types:        sp.get("types")?.split(",").filter(Boolean) ?? [],
    industries:   sp.get("industries")?.split(",").filter(Boolean) ?? [],
    stages:       sp.get("stages")?.split(",").filter(Boolean) ?? [],
    geographies:  sp.get("geo")?.split(",").filter(Boolean) ?? [],
    minCheck:     Number(sp.get("min")) || 0,
    maxCheck:     Number(sp.get("max")) || 100_000_000,
    leadOnly:     sp.get("lead") === "1",
    verifiedOnly: sp.get("verified") === "1",
    fitOnly:      sp.get("fit") === "1",
    newOnly:      sp.get("new") === "1",
    sort:         (sp.get("sort") as InvestorFilters["sort"]) || "recent",
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [investors, setInvestors] = useState<Investor[]>([]);
  // Typeahead over the already-loaded list -- instant, no round trip.
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIdx, setSuggestIdx] = useState(-1);
  // Recent queries, mirroring the startups directory (localStorage, FIFO 10).
  const RECENT_KEY = "cr_recent_investor_searches";
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
  const [loading, setLoading] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  // If a founder is browsing, their own stage and industry mark which
  // investors actually fit the raise -- the directory as a targeting tool.
  const [myRaise, setMyRaise] = useState<{ stage: string; industry: string } | null>(null);

  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    async function fetchInvestors() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("investors")
          .select(`
            id, slug, type, bio, industries, stages, min_check, max_check, geography, subscription_tier, lead_rounds, created_at,
            profiles:owner_id ( full_name, email )
          `)
          .order("created_at", { ascending: false });

        if (data) {
          const mapped = data.map((inv: any) => ({
            id: inv.id,
            slug: inv.slug,
            type: inv.type || "angel",
            bio: inv.bio,
            industries: inv.industries || [],
            stages: inv.stages || [],
            min_check: inv.min_check,
            lead_rounds: !!inv.lead_rounds,
            created_at: inv.created_at,
            max_check: inv.max_check,
            geography: inv.geography || [],
            subscription_tier: inv.subscription_tier,
            full_name: inv.profiles?.full_name || null,
            firm: inv.firm || null,
          }));
          setInvestors(mapped);
        }
      } catch {
        // DB not connected
      }
      setLoading(false);
    }
    fetchInvestors();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: st } = await supabase
        .from("startups").select("stage, industry").eq("owner_id", user.id).maybeSingle();
      if (st) setMyRaise({ stage: st.stage, industry: st.industry });
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

  function toggle<K extends "types" | "industries" | "stages" | "geographies">(key: K, val: string) {
    const arr = f[key] as string[];
    setF(prev => ({ ...prev, [key]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] }));
  }

  // Every country any loaded investor covers, deduped and sorted.
  const allGeographies = useMemo(
    () => Array.from(new Set(investors.flatMap(i => i.geography || []))).sort(),
    [investors]
  );

  const activeCount =
    f.types.length + f.industries.length + f.stages.length + f.geographies.length +
    (f.minCheck > 0 ? 1 : 0) + (f.maxCheck < 100_000_000 ? 1 : 0) + (f.leadOnly ? 1 : 0) + (f.verifiedOnly ? 1 : 0) +
    (f.fitOnly ? 1 : 0) + (f.newOnly ? 1 : 0);

  // Debounced write-back: the URL always names the current search.
  useEffect(() => {
    const id = setTimeout(() => {
      const p = new URLSearchParams();
      if (f.query)             p.set("q", f.query);
      if (f.types.length)      p.set("types", f.types.join(","));
      if (f.industries.length) p.set("industries", f.industries.join(","));
      if (f.stages.length)     p.set("stages", f.stages.join(","));
      if (f.geographies.length) p.set("geo", f.geographies.join(","));
      if (f.minCheck > 0)      p.set("min", String(f.minCheck));
      if (f.maxCheck < 100_000_000) p.set("max", String(f.maxCheck));
      if (f.leadOnly)          p.set("lead", "1");
      if (f.verifiedOnly)      p.set("verified", "1");
      if (f.fitOnly)           p.set("fit", "1");
      if (f.newOnly)           p.set("new", "1");
      if (f.sort !== "recent") p.set("sort", f.sort);
      const qs = p.toString();
      const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      if (next !== window.location.pathname + window.location.search) {
        window.history.replaceState(window.history.state, "", next);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [f]);

  const fits = (inv: Investor) =>
    !!myRaise && (inv.stages || []).includes(myRaise.stage) && (inv.industries || []).includes(myRaise.industry);

  // Facet counts for the type chips: computed against every other filter, so
  // a chip's number answers "what would I get if I added this".
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inv of investors) counts[inv.type] = (counts[inv.type] ?? 0) + 1;
    return counts;
  }, [investors]);

  // Compare tray, mirroring the startups directory.
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  function exportInvestorsCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Name", "Firm", "Type", "Min check", "Max check", "Stages", "Industries", "Geography", "Leads rounds", "Profile"];
    const lines = results.map(i => [
      i.full_name, i.firm, i.type, i.min_check, i.max_check,
      (i.stages || []).join("; "), (i.industries || []).join("; "), (i.geography || []).join("; "),
      i.lead_rounds ? "yes" : "no", `${window.location.origin}/investors/${i.slug}`,
    ]);
    const csv = [header, ...lines].map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "investors.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 3 ? prev : [...prev, id]);
  }

  const results = useMemo(() => {
    let list = investors.filter(inv => {
      const name = inv.full_name || "";
      const q = f.query.toLowerCase();
      const matchQ = !q || name.toLowerCase().includes(q) ||
        (inv.bio || "").toLowerCase().includes(q) ||
        (inv.industries || []).some(i => i.toLowerCase().includes(q)) ||
        (inv.geography || []).some(g => g.toLowerCase().includes(q));
      const matchType = f.types.length === 0 || f.types.includes(inv.type);
      const matchInd = f.industries.length === 0 || f.industries.some(i => (inv.industries || []).includes(i));
      const matchStage = f.stages.length === 0 || f.stages.some(s => (inv.stages || []).includes(s));
      // Geography was fetched for every investor and shown on cards, but not
      // filterable -- the one axis a founder actually starts from ("who
      // invests where I am?").
      const matchGeo = f.geographies.length === 0 || f.geographies.some(g => (inv.geography || []).includes(g));
      const matchLead = !f.leadOnly || !!inv.lead_rounds;
      const matchVerified = !f.verifiedOnly || (!!inv.subscription_tier && inv.subscription_tier !== "free");
      const matchFit = !f.fitOnly || fits(inv);
      const matchNew = !f.newOnly || (!!inv.created_at && (Date.now() - new Date(inv.created_at).getTime()) / 86400000 <= 30);
      const minCheckOk = !inv.max_check || inv.max_check >= f.minCheck;
      const maxCheckOk = !inv.min_check || inv.min_check <= f.maxCheck;
      return matchQ && matchType && matchInd && matchStage && matchGeo && matchLead && matchVerified && matchFit && matchNew && minCheckOk && maxCheckOk;
    });

    if (f.sort === "check_desc") list = [...list].sort((a, b) => (b.max_check || 0) - (a.max_check || 0));
    else if (f.sort === "check_asc") list = [...list].sort((a, b) => (a.min_check || 0) - (b.min_check || 0));
    else if (f.sort === "name") list = [...list].sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    else if (f.sort === "fit") list = [...list].sort((a, b) => Number(fits(b)) - Number(fits(a)));

    return list;
  }, [f, investors, myRaise]);

  // Parity with the startups browse: filtering rewrites the grid with no
  // navigation, so a screen reader is told nothing at all. Skips the first
  // render, where a count read over the page title is noise rather than news.
  const hasAnnounced = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!hasAnnounced.current) { hasAnnounced.current = true; return; }
    announce(t("investors.foundCount", { count: results.length }));
  }, [results.length, loading, t]);

  const Sidebar = (
    <aside className="w-64 flex-shrink-0 bg-cr-paper rounded-2xl border border-cr-p4 p-5 space-y-4 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-cr-ink">
          <Filter className="h-4 w-4 text-cr-copper" />
          {t("investors.filters")}
          {activeCount > 0 && (
            <span className="ml-1 text-[10px] font-bold bg-cr-copper text-white px-1.5 py-0.5 rounded-full">{activeCount}</span>
          )}
        </div>
        {activeCount > 0 && (
          <button onClick={() => setF(DEFAULT)} className="text-xs text-cr-copper hover:text-cr-cu-l flex items-center gap-1 font-medium">
            <X className="h-3 w-3" /> {t("investors.clear")}
          </button>
        )}
      </div>

      <div className="h-px bg-border-dark" />

      {/* Sort */}
      <Section title={t("investors.sortBy")}>
        <div className="space-y-1">
          {([
            ["recent",       t("investors.sortRecent")],
            ["check_desc",   t("investors.sortLargest")],
            ["check_asc",    t("investors.sortSmallest")],
            ["name",         t("investors.sortName")],
            ...(myRaise ? [["fit", t("investors.sortFit")] as const] : []),
          ] as const).map(([val, label]) => (
            <button key={val} onClick={() => setF(p => ({ ...p, sort: val }))}
              className={cn("w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors",
                f.sort === val ? "bg-cr-copper/15 text-cr-cu-l font-semibold" : "text-cr-i2 hover:bg-cr-p2")}
            >{label}</button>
          ))}
        </div>
      </Section>

      <label className="flex items-center gap-2 cursor-pointer select-none py-1">
        <Checkbox checked={f.leadOnly} onCheckedChange={(v) => setF(p => ({ ...p, leadOnly: v === true }))} />
        <span className="text-sm text-cr-i2">{t("investors.leadOnly")}</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer select-none py-1">
        <Checkbox checked={f.verifiedOnly} onCheckedChange={(v) => setF(p => ({ ...p, verifiedOnly: v === true }))} />
        <span className="text-sm text-cr-i2">{t("investors.verifiedOnly")}</span>
      </label>
      {myRaise && (
        <label className="flex items-center gap-2 cursor-pointer select-none py-1">
          <Checkbox checked={f.fitOnly} onCheckedChange={(v) => setF(p => ({ ...p, fitOnly: v === true }))} />
          <span className="text-sm text-cr-copper font-medium">{t("investors.fitOnly")}</span>
        </label>
      )}
      <label className="flex items-center gap-2 cursor-pointer select-none py-1">
        <Checkbox checked={f.newOnly} onCheckedChange={(v) => setF(p => ({ ...p, newOnly: v === true }))} />
        <span className="text-sm text-cr-i2">{t("investors.newMonth")}</span>
      </label>

      <div className="h-px bg-border-dark" />

      {/* Investor type */}
      <Section title={t("investors.investorType")} count={f.types.length}>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(TYPE_META).map(([val, meta]) => (
            <button key={val} onClick={() => toggle("types", val)}
              className={cn("text-xs font-medium px-2.5 py-1 rounded-full border transition-all",
                f.types.includes(val)
                  ? `${meta.bg} ${meta.color} ${meta.border} font-bold`
                  : "border-cr-p4 text-cr-i4 hover:border-cr-i4 hover:text-cr-i2"
              )}
            >{t(meta.labelKey)}{typeCounts[val] ? ` (${typeCounts[val]})` : ""}</button>
          ))}
        </div>
      </Section>

      <div className="h-px bg-border-dark" />

      {/* Check size */}
      <Section title={t("investors.checkSizeRange")} count={(f.minCheck > 0 ? 1 : 0) + (f.maxCheck < 100_000_000 ? 1 : 0)}>
        <div className="px-1 pt-1">
          <Slider
            min={0} max={100_000_000} step={100_000}
            value={[f.minCheck, f.maxCheck]}
            onValueChange={([min, max]) => setF(p => ({ ...p, minCheck: min, maxCheck: max }))}
          />
          <div className="flex justify-between text-xs text-cr-i4 mt-2 font-medium">
            <span>{formatCheck(f.minCheck)}</span>
            <span>{f.maxCheck >= 100_000_000 ? t("investors.noMax") : formatCheck(f.maxCheck)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {([[0, 100_000, "<$100K"], [100_000, 1_000_000, "$100K–$1M"], [1_000_000, 100_000_000, "$1M+"]] as const).map(([min, max, label]) => {
              const active = f.minCheck === min && f.maxCheck === max;
              return (
                <button key={label}
                  onClick={() => setF(p => ({ ...p, minCheck: active ? 0 : min, maxCheck: active ? 100_000_000 : max }))}
                  className={cn("text-xs font-medium px-2.5 py-1 rounded-full border transition-all",
                    active ? "border-cr-copper/40 text-cr-copper bg-cr-copper/10 font-bold" : "border-cr-p4 text-cr-i4 hover:border-cr-i4 hover:text-cr-i2")}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      <div className="h-px bg-border-dark" />

      {/* Stages */}
      <Section title={t("investors.investmentStage")} count={f.stages.length}>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map(s => (
            <button key={s.value} onClick={() => toggle("stages", s.value)}
              className={cn("text-xs font-medium px-2.5 py-1 rounded-full border transition-all",
                f.stages.includes(s.value)
                  ? "bg-cr-copper text-white border-cr-copper"
                  : "border-cr-p4 text-cr-i4 hover:border-cr-copper/40 hover:text-cr-i2")}
            >{s.label}</button>
          ))}
        </div>
      </Section>

      <div className="h-px bg-border-dark" />

      {/* Industries */}
      <Section title={t("investors.focusIndustries")} count={f.industries.length} defaultOpen={false}>
        <div className="max-h-44 overflow-y-auto space-y-0.5 pr-1">
          {INDUSTRIES.map(ind => (
            <label key={ind} className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
              f.industries.includes(ind) ? "bg-cr-copper/10" : "hover:bg-cr-p2"
            )}>
              <Checkbox checked={f.industries.includes(ind)} onCheckedChange={() => toggle("industries", ind)} />
              <span className="text-sm text-cr-i2">{ind}</span>
            </label>
          ))}
        </div>
      </Section>

      <div className="h-px bg-border-dark" />

      {/* Geography — options come from the loaded investors, so the list never
          offers a country with zero investors behind it. */}
      <Section title={t("investors.geography")} count={f.geographies.length} defaultOpen={false}>
        <div className="max-h-44 overflow-y-auto space-y-0.5 pr-1">
          {allGeographies.map(geo => (
            <label key={geo} className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
              f.geographies.includes(geo) ? "bg-cr-copper/10" : "hover:bg-cr-p2"
            )}>
              <Checkbox checked={f.geographies.includes(geo)} onCheckedChange={() => toggle("geographies", geo)} />
              <span className="text-sm text-cr-i2">{geo}</span>
            </label>
          ))}
        </div>
      </Section>
    </aside>
  );

  return (
    <main className="container mx-auto px-4 py-12 max-w-6xl">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-cr-copper/10 border border-cr-copper/20 rounded-full px-4 py-1.5 mb-4">
          <Users className="h-3.5 w-3.5 text-cr-copper" />
          <span className="text-sm font-semibold text-cr-cu-l">
            {loading
              ? t("common.loading")
              : investors.length === 1
                ? t("investors.registeredCountOne")
                : t("investors.registeredCount", { count: investors.length })}
          </span>
        </div>
        <h1 className="text-4xl font-extrabold text-cr-ink mb-3 tracking-tight">{t("investors.directoryTitle")}</h1>
        <p className="text-lg text-cr-i3 max-w-xl mx-auto">
          {t("investors.directorySub")}
        </p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Sidebar — desktop */}
        <div className="hidden lg:block flex-shrink-0 w-64">{Sidebar}</div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Search + controls */}
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cr-i4" />
              <input
                ref={searchRef}
                value={f.query}
                onChange={e => { setF(p => ({ ...p, query: e.target.value })); setSuggestOpen(true); setSuggestIdx(-1); }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                onKeyDown={e => {
                  if (e.key === "Escape") { setSuggestOpen(false); return; }
                  const hits = investors.filter(i => (i.full_name || "").toLowerCase().includes(f.query.trim().toLowerCase())).slice(0, 6);
                  if (!f.query.trim() || hits.length === 0) return;
                  if (e.key === "ArrowDown") { e.preventDefault(); setSuggestIdx(i => Math.min(i + 1, hits.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setSuggestIdx(i => Math.max(i - 1, -1)); }
                  else if (e.key === "Enter") {
                    rememberQuery(f.query);
                    if (suggestIdx >= 0) { e.preventDefault(); window.location.href = `/investors/${hits[suggestIdx].slug}`; }
                  }
                }}
                placeholder={t("investors.searchPlaceholder")}
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-cr-p4 bg-cr-paper text-cr-ink text-sm placeholder:text-cr-i4 focus:outline-none focus:ring-2 focus:ring-cr-copper/40 focus:border-cr-copper/50"
              />
              {suggestOpen && f.query.trim().length < 2 && recent.length > 0 && (
                <div className="absolute top-full mt-1.5 left-0 w-full max-w-sm bg-cr-paper border border-cr-p4 rounded-xl shadow-lg overflow-hidden z-50">
                  <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-cr-i4">
                    {t("startups.recentSearches")}
                  </p>
                  {recent.slice(0, 5).map((term) => (
                    <div key={term} className="flex items-center justify-between gap-2 px-4 py-2">
                      <button onMouseDown={(e) => { e.preventDefault(); setF(p => ({ ...p, query: term })); }}
                        className="flex items-center gap-2 text-sm text-cr-i2 flex-1 text-left">
                        <Clock className="h-3 w-3 text-cr-i4 shrink-0" /> {term}
                      </button>
                      <button onMouseDown={(e) => { e.preventDefault(); forgetQuery(term); }} aria-label={`remove ${term}`}
                        className="text-cr-i4 text-sm leading-none">×</button>
                    </div>
                  ))}
                </div>
              )}
              {suggestOpen && f.query.trim().length >= 2 && (() => {
                const hits = investors
                  .filter(i => (i.full_name || "").toLowerCase().includes(f.query.trim().toLowerCase()))
                  .slice(0, 6);
                return hits.length > 0 ? (
                  <div className="absolute top-full mt-1.5 left-0 w-full max-w-sm bg-cr-paper border border-cr-p4 rounded-xl shadow-lg overflow-hidden z-50">
                    {hits.map((i, hi) => (
                      <Link key={i.id} href={`/investors/${i.slug}`}
                        className={cn("flex flex-col gap-0.5 px-4 py-2.5 border-b border-cr-p4/50 last:border-0 hover:bg-cr-p2 no-underline", hi === suggestIdx && "bg-cr-p2")}>
                        <span className="text-sm font-semibold text-cr-ink" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>{i.full_name}</span>
                        <span className="text-xs text-cr-i4">{t((TYPE_META[i.type] ?? TYPE_META.angel).labelKey)}{i.firm ? ` · ${i.firm}` : ""}</span>
                      </Link>
                    ))}
                  </div>
                ) : null;
              })()}
              {f.query && (
                <button onClick={() => setF(p => ({ ...p, query: "" }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-cr-i4 hover:text-cr-i2">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className={cn(
                "lg:hidden inline-flex items-center gap-2 h-11 px-4 rounded-xl border text-sm font-medium transition-colors",
                sidebarOpen ? "bg-cr-copper text-white border-cr-copper" : "border-cr-p4 text-cr-i2 hover:border-cr-i4"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {t("investors.filters")} {activeCount > 0 && `(${activeCount})`}
            </button>
          </div>

          {/* Mobile sidebar */}
          {sidebarOpen && <div className="lg:hidden mb-6">{Sidebar}</div>}

          {/* Compare tray + modal, mirroring the startups directory */}
          {compareIds.length > 0 && (
            <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-cr-ink rounded-md px-4 py-2.5 shadow-2xl">
              <span className="text-[13px] text-cr-p2" style={{ color: "#EDE8DE" }}>
                {compareIds.map(id => investors.find(i => i.id === id)?.full_name).filter(Boolean).join(" · ")}
              </span>
              <button onClick={() => setShowCompare(true)} disabled={compareIds.length < 2}
                className={cn("bg-cr-copper text-white text-xs font-semibold rounded px-3.5 py-1.5", compareIds.length < 2 ? "opacity-50" : "cursor-pointer")}>
                {t("investors.compare2")} ({compareIds.length})
              </button>
              <button onClick={() => setCompareIds([])} aria-label="clear compare" className="text-cr-i4 flex">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {showCompare && (() => {
            const rows = compareIds.map(id => investors.find(i => i.id === id)).filter((i): i is Investor => !!i);
            const METRICS: Array<{ label: string; get: (i: Investor) => string }> = [
              { label: t("investors.investorType"),   get: (i) => t((TYPE_META[i.type] ?? TYPE_META.angel).labelKey) },
              { label: t("investors.checkSize"),      get: (i) => i.min_check || i.max_check ? `${formatCheck(i.min_check || 0)} – ${formatCheck(i.max_check || 0)}` : "—" },
              { label: t("investors.investmentStage"), get: (i) => (i.stages || []).map(s => STAGE_LABELS[s] ?? s).join(", ") || "—" },
              { label: t("investors.focusIndustries"), get: (i) => (i.industries || []).join(", ") || "—" },
              { label: t("investors.geography"),      get: (i) => (i.geography || []).join(", ") || "—" },
              { label: t("investors.leadsRounds"),    get: (i) => i.lead_rounds ? "✓" : "—" },
            ];
            return (
              <div className="fixed inset-0 z-[70]">
                <div className="absolute inset-0 bg-cr-ink/50" onClick={() => setShowCompare(false)} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,760px)] max-h-[84vh] overflow-y-auto bg-cr-paper border border-cr-p4 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-cr-ink" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>{t("investors.compareInvestors")}</h2>
                    <button onClick={() => setShowCompare(false)} aria-label="close" className="text-cr-i4 flex"><X className="h-5 w-5" /></button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="w-[130px]" />
                          {rows.map(i => (
                            <th key={i.id} className="text-left px-3 py-2 border-b-2 border-cr-copper">
                              <Link href={`/investors/${i.slug}`} className="text-[15px] font-bold text-cr-ink no-underline" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
                                {i.full_name}
                              </Link>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {METRICS.map(m => (
                          <tr key={m.label}>
                            <td className="py-2.5 pr-3 text-[10px] font-medium uppercase tracking-wide text-cr-i4 border-b border-cr-p4/60">{m.label}</td>
                            {rows.map(i => (
                              <td key={i.id} className="px-3 py-2.5 text-[13px] text-cr-ink border-b border-cr-p4/60">{m.get(i)}</td>
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

          {/* Same one-click shortcuts as the startups directory. */}
          <div style={{ marginBottom: "14px" }}>
            <FilterPresets
              presets={INVESTOR_PRESETS}
              filters={f as unknown as Record<string, unknown>}
              defaults={DEFAULT as unknown as Record<string, unknown>}
              onApply={(p) => setF((prev) => ({ ...prev, ...(p as Partial<InvestorFilters>) }))}
            />
          </div>

          {/* Applied filters, each individually removable -- mirrors the
              startups directory so the two search surfaces feel like one. */}
          {activeCount > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-5">
              {f.types.map(ty => (
                <AppliedChip key={`t-${ty}`} label={t((TYPE_META[ty] ?? TYPE_META.angel).labelKey)} onRemove={() => toggle("types", ty)} />
              ))}
              {f.industries.map(ind => (
                <AppliedChip key={`i-${ind}`} label={ind} onRemove={() => toggle("industries", ind)} />
              ))}
              {f.stages.map(st => (
                <AppliedChip key={`s-${st}`} label={STAGE_LABELS[st] ?? st} onRemove={() => toggle("stages", st)} />
              ))}
              {f.geographies.map(g => (
                <AppliedChip key={`g-${g}`} label={g} onRemove={() => toggle("geographies", g)} />
              ))}
              {f.minCheck > 0 && <AppliedChip label={`≥ ${formatCheck(f.minCheck)}`} onRemove={() => setF(p => ({ ...p, minCheck: 0 }))} />}
              {f.maxCheck < 100_000_000 && <AppliedChip label={`≤ ${formatCheck(f.maxCheck)}`} onRemove={() => setF(p => ({ ...p, maxCheck: 100_000_000 }))} />}
              {f.leadOnly && <AppliedChip label={t("investors.leadOnly")} onRemove={() => setF(p => ({ ...p, leadOnly: false }))} />}
              {f.verifiedOnly && <AppliedChip label={t("investors.verifiedOnly")} onRemove={() => setF(p => ({ ...p, verifiedOnly: false }))} />}
              <button onClick={() => setF(p => ({ ...DEFAULT, query: p.query }))}
                className="text-xs text-cr-i4 hover:text-cr-i2 underline underline-offset-2 ml-1">
                {t("investors.clearAllFilters")}
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-cr-i4">
              <Loader2 className="h-8 w-8 animate-spin text-cr-copper" />
              <p className="text-sm">{t("investors.loadingInvestors")}</p>
            </div>
          ) : investors.length === 0 ? (
            /* No investors yet */
            <div className="text-center py-20 bg-cr-paper rounded-2xl border border-cr-p4">
              <div className="w-16 h-16 bg-cr-copper/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-cr-copper/40" />
              </div>
              <p className="font-bold text-cr-ink text-lg mb-2">{t("investors.noInvestorsYet")}</p>
              <p className="text-sm text-cr-i3 mb-6 max-w-xs mx-auto">
                {t("investors.noInvestorsYetSub")}
              </p>
              <Link
                href="/auth/signup?role=investor"
                className="inline-flex items-center gap-2 bg-cr-copper text-white text-sm font-semibold px-6 py-3 rounded-xl hover:bg-cr-cu-l transition-colors"
              >
                {t("investors.joinAsInvestor")} →
              </Link>
            </div>
          ) : (
            <>
              {/* Result count */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-cr-i3">
                  {results.length === 1
                    ? t("investors.foundCountOne")
                    : t("investors.foundCount", { count: results.length })}
                  {f.query && <span className="ml-1">{t("investors.forQuery")} &ldquo;<em>{f.query}</em>&rdquo;</span>}
                  {results.length > 0 && (
                    <span className="ml-2 text-cr-i4">
                      · {t("investors.combinedCapacity", { count: results.length, sum: formatCheck(results.reduce((a, i) => a + (i.max_check || 0), 0)) })}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  {activeCount > 0 && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(window.location.href); notify.success(t("startups.linkCopied2")); }}
                      className="text-xs text-cr-copper hover:underline font-medium">
                      {t("investors.copyLink")}
                    </button>
                  )}
                  {results.length > 0 && (
                    <button onClick={exportInvestorsCsv} className="text-xs text-cr-i4 hover:text-cr-i2 hover:underline font-medium">
                      {t("investors.exportCsv2")}
                    </button>
                  )}
                  {activeCount > 0 && (
                    <button onClick={() => setF(DEFAULT)} className="text-xs text-cr-copper hover:underline font-medium flex items-center gap-1">
                      <X className="h-3 w-3" /> {t("investors.clearFilters")}
                    </button>
                  )}
                </div>
              </div>

              {/* Investor grid */}
              {results.length === 0 ? (
                /* The shared shell, same as the startups browse — every list
                   surface's dead end should look like the same product. */
                <EmptyState
                  Icon={Users}
                  title={t("investors.noMatch")}
                  body={t("investors.noMatchSub")}
                  action={
                    <button onClick={() => setF(DEFAULT)}
                      style={{ background: "transparent", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", minHeight: "40px", padding: "8px 20px", borderRadius: "4px", border: "1px solid var(--cr-rule-dark)", cursor: "pointer" }}>
                      {t("investors.clearAllFilters")}
                    </button>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {results.map((inv, idx) => {
                    const meta = TYPE_META[inv.type] ?? TYPE_META.angel;
                    const grad = GRAD_COLORS[idx % GRAD_COLORS.length];
                    const displayName = inv.full_name || t("investors.anonymousInvestor");
                    return (
                      <div key={inv.id} className="group relative bg-cr-paper border border-cr-p4 rounded-2xl p-5 hover:border-cr-copper/30 hover:shadow-[0_0_20px_rgba(196,158,80,0.1)] transition-all duration-200 flex flex-col">
                        {/* Top */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="absolute top-4 right-4 flex items-center gap-2">
                            {myRaise && (
                              <button
                                onClick={async (e) => {
                                  e.preventDefault(); e.stopPropagation();
                                  const res = await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ investorId: inv.id }) });
                                  if (res.ok) notify.success(t("targets.added")); else notify.error(t("targets.failed"));
                                }}
                                aria-label={t("investors.target2")} title={t("investors.target2")}
                                className="text-cr-p4 hover:text-cr-copper transition-colors">
                                <Crosshair className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCompare(inv.id); }}
                              aria-label={t("investors.compare2")} title={t("investors.compare2")}
                              className={cn("transition-colors", compareIds.includes(inv.id) ? "text-cr-copper" : "text-cr-p4 hover:text-cr-copper")}>
                              <GitCompareArrows className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded bg-cr-copper flex items-center justify-center font-bold text-white text-lg flex-shrink-0">
                              {displayName[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-cr-ink leading-tight group-hover:text-cr-copper transition-colors" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "15px" }}>{displayName}</p>
                              {inv.firm && <p className="text-xs text-cr-i4 mt-0.5">{inv.firm}</p>}
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-sm border bg-transparent uppercase tracking-wide", meta.color, meta.border)}>
                                  {t(meta.labelKey)}
                                </span>
                                {inv.lead_rounds && (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-sm border border-cr-copper-br text-cr-copper bg-transparent uppercase tracking-wide">
                                    {t("investors.leadsRounds")}
                                  </span>
                                )}
                                {myRaise && (inv.stages || []).includes(myRaise.stage) && (inv.industries || []).includes(myRaise.industry) && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-sm bg-cr-copper text-white uppercase tracking-wide">
                                    {t("investors.fitsYourRaise")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Bio */}
                        {inv.bio && (
                          <p className="text-sm text-cr-i3 line-clamp-2 leading-relaxed mb-4 flex-1">{inv.bio}</p>
                        )}

                        {/* Check size */}
                        {(inv.min_check || inv.max_check) && (
                          <div className="border-t border-b border-cr-p4 px-0.5 py-2 mb-3">
                            <p className="text-[10px] text-cr-i4 font-medium mb-0.5 uppercase tracking-wide">{t("investors.checkSize")}</p>
                            <p className="text-xs text-cr-copper" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                              {inv.min_check ? formatCheck(inv.min_check) : t("investors.any")} – {inv.max_check ? formatCheck(inv.max_check) : t("investors.any")}
                            </p>
                          </div>
                        )}

                        {/* Stages */}
                        {inv.stages && inv.stages.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {inv.stages.map(s => (
                              <span key={s} className="text-[10px] font-medium px-2 py-0.5 bg-transparent text-cr-i3 border border-cr-p4 rounded-sm uppercase tracking-wide">
                                {STAGE_LABELS[s] ?? s}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Industries */}
                        {inv.industries && inv.industries.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {inv.industries.slice(0, 3).map(ind => (
                              <span key={ind} className="text-[10px] font-medium px-2 py-0.5 bg-transparent text-cr-i4 border border-cr-p4 rounded-sm">{ind}</span>
                            ))}
                            {inv.industries.length > 3 && (
                              <span className="text-[10px] font-medium px-2 py-0.5 bg-transparent text-cr-i4 border border-cr-p4 rounded-sm">+{inv.industries.length - 3}</span>
                            )}
                          </div>
                        )}

                        {/* Geography */}
                        {inv.geography && inv.geography.length > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-cr-i4 mb-4">
                            <Globe className="h-3 w-3" />
                            {inv.geography.slice(0, 2).join(" · ")}
                            {inv.geography.length > 2 && ` +${inv.geography.length - 2}`}
                          </div>
                        )}

                        {/* CTA */}
                        <Link
                          href={`/investors/${inv.slug}`}
                          className="mt-auto w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-cr-copper hover:bg-cr-cu-l text-white text-sm font-semibold transition-colors"
                        >
                          {t("investors.viewProfile")} →
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Bottom CTA */}
          {!loading && (
            <div className="mt-16 bg-cr-copper rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-5 text-white">
              <div>
                <h2 className="text-xl font-bold mb-1">{t("investors.readyFunded")}</h2>
                <p className="text-white/70 text-sm">{t("investors.readyFundedSub")}</p>
              </div>
              <Link href="/auth/signup?role=startup"
                className="inline-flex items-center gap-2 bg-cr-copper text-white hover:bg-cr-cu-l h-11 px-6 rounded-xl text-sm font-bold whitespace-nowrap transition-colors shadow-lg flex-shrink-0">
                {t("investors.listYourStartup")} →
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
