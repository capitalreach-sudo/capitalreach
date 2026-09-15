"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { countryLabel } from "@/lib/country-label";
import { DemoBadge } from "@/components/shared/demo-badge";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { announce } from "@/lib/announce";
import {
  Search, SlidersHorizontal, X, ChevronDown, ChevronUp,
  Users, Globe, Loader2, Crosshair, GitCompareArrows, Clock, Bookmark,
} from "lucide-react";
import { INDUSTRIES, STAGES } from "@/types";
import { cn, STAGE_LABELS } from "@/lib/utils";
import { meetsDirectoryBar, normaliseInvestorStages, plausibleCheck } from "@/lib/investor-directory-rules";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { notify } from "@/components/ui/toast-notify";
import { INVESTOR_PRESETS } from "@/lib/search-presets";
import { FilterPresets } from "@/components/search/filter-presets";
import { EmptyState } from "@/components/ui/EmptyState";
import { InvestorWatchButton } from "@/components/investors/investor-watch-button";

// Labels only. The per-type palette tints (blue/amber/rose) were off-token;
// in the house register the type is a quiet hairline badge like every other
// badge, so the map carries nothing but the i18n key.
const TYPE_META: Record<string, { labelKey: string }> = {
  angel:         { labelKey: "investors.typeAngel"        },
  vc:            { labelKey: "investors.typeVc"           },
  family_office: { labelKey: "investors.typeFamilyOffice" },
  corporate:     { labelKey: "investors.typeCorporate"    },
};

// Canonical stage labels from lib/utils -- the local copy had the wrong
// keys and rendered raw enums for pre-seed and series_b_plus.

function formatCheck(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/** One applied filter in the summary row -- same chip as the startups page. */
function AppliedChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-2)", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "4px 8px 4px 12px" }}>
      {label}
      <button onClick={onRemove} aria-label={`remove ${label}`} data-tap-exempt=""
        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}>
        <X style={{ width: 11, height: 11 }} />
      </button>
    </span>
  );
}

/** Option chip, identical register to the startups directory's FilterChip. */
function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily:    "'DM Sans', sans-serif",
        fontWeight:    active ? 500 : 400,
        fontSize:      "13px",
        padding:       "8px 16px",
        borderRadius:  "4px",
        border:        active ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)",
        background:    active ? "var(--cr-copper-bg)" : "var(--cr-paper-3)",
        color:         active ? "var(--cr-copper)" : "var(--cr-ink-3)",
        cursor:        "pointer",
        whiteSpace:    "nowrap",
        transition:    "background-color 100ms ease, color 100ms ease",
      }}
    >
      {children}
    </button>
  );
}

function Section({ title, count = 0, children, defaultOpen = true }: { title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between group"
        style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: "8px", minHeight: "28px" }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-3)", textAlign: "left" }}>
          {title}
          {count > 0 && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", letterSpacing: 0 }}> · {count}</span>
          )}
        </span>
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
  verified_at: string | null;
  number_of_investments?: number | null;
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
  sort: "recent" | "check_asc" | "check_desc" | "name" | "fit" | "active";
}

const DEFAULT: InvestorFilters = {
  query: "", types: [], industries: [], stages: [],
  minCheck: 0, maxCheck: 100_000_000, geographies: [], leadOnly: false, verifiedOnly: false, fitOnly: false, newOnly: false, sort: "recent",
};

export function InvestorsClient({ initialInvestors, initialIsPartial }: { initialInvestors?: Investor[]; initialIsPartial?: boolean } = {}) {
  const { t } = useTranslation();
  // Same guard the profile page and InvestorWatchButton already use: renders
  // before the dictionary carries a newer key, and a missing key must not put
  // a dot-path where copy belongs.
  const tf = (key: string, fallback: string) => { const out = t(key); return out === key ? fallback : out; };
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
  // Server-rendered rows (lib/browse-data) make the first paint the finished
  // directory; the client query below only runs when none were provided.
  const [investors, setInvestors] = useState<Investor[]>(initialInvestors ?? []);
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
  const [loading, setLoading] = useState(!initialInvestors);
  const [loadError, setLoadError] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // If a founder is browsing, their own stage and industry mark which
  // investors actually fit the raise -- the directory as a targeting tool.
  const [myRaise, setMyRaise] = useState<{ stage: string; industry: string } | null>(null);
  // Watchlisting a fellow investor (migration 139) is investor-only: the
  // button is gated on the viewer owning an investor entity, and hidden on
  // that investor's own card. savedInvestorTargetIds mirrors startups-search's
  // savedIds -- read straight off watchlists, scoped by RLS to the caller.
  const [viewerInvestorId, setViewerInvestorId] = useState<string | null>(null);
  const [savedInvestorTargetIds, setSavedInvestorTargetIds] = useState<Set<string>>(new Set());
  // Nothing on this surface told an investor the watch/bookmark icon was a
  // brand-new capability (migration 139) -- it's one of three unlabeled icons
  // in a card corner, with only a title/aria-label tooltip, next to the much
  // more legible "Watch" pill on the profile page. A one-time, dismissible
  // callout, shown once per browser and never again once dismissed or read.
  const WATCH_HINT_KEY = "cr_seen_investor_watch_hint";
  const [showWatchHint, setShowWatchHint] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(WATCH_HINT_KEY)) setShowWatchHint(true); } catch { /* private mode: skip the hint, not the feature */ }
  }, []);
  function dismissWatchHint() {
    setShowWatchHint(false);
    try { localStorage.setItem(WATCH_HINT_KEY, "1"); } catch { /* private mode */ }
  }

  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    async function fetchInvestors() {
      // A FULL server payload makes the round trip redundant. A PARTIAL one
      // (the page ships the first screenfuls to keep the HTML light) is topped
      // up quietly behind the rows already painted -- no spinner over a
      // directory the reader is looking at, and no silent cap at 60.
      if (initialInvestors && !initialIsPartial) return;
      const toppingUp = !!initialInvestors;
      if (!toppingUp) setLoading(true);
      try {
        // display_name / firm_name are the investor's own published fields;
        // profiles is not anonymously readable (019), so it is not joined.
        // is_external mirrors the server loader: off-platform contacts belong
        // to the startup that created them (RLS agrees, this is explicit).
        const { data } = await supabase
          .from("investors")
          .select("id, slug, type, bio, industries, stages, min_check, max_check, geography, subscription_tier, verified_at, lead_rounds, number_of_investments, created_at, display_name, firm_name, is_public, is_demo")
          .eq("is_public", true)
          .eq("is_external", false)
          .order("created_at", { ascending: false });

        if (data) {
          // The same completeness bar loadPublicInvestors() applies server
          // side (lib/browse-data.ts): a bio under DIRECTORY_MIN_BIO chars, no
          // plausible check size, or no recognised stage, and the row never
          // reaches the directory. This client path only ever ran once the
          // directory passed 60 investors (initialIsPartial) or the SSR
          // loader errored -- invisible with today's 2 real rows, but without
          // this bar the top-up would admit junk/incomplete rows the server
          // loader deliberately withholds, with raw un-normalised stage
          // strings that would not match STAGE_LABELS or the filter chips.
          // normaliseInvestorStages/plausibleCheck/meetsDirectoryBar are the
          // SAME functions the server loader calls (lib/investor-directory-
          // rules.ts), so the two paths cannot drift apart again.
          const mapped = data
            .map((inv: any) => {
              const stages = normaliseInvestorStages(inv.stages);
              const min_check = plausibleCheck(inv.min_check);
              const max_check = plausibleCheck(inv.max_check);
              const bio = typeof inv.bio === "string" ? inv.bio.trim() : "";
              return {
                id: inv.id,
                slug: inv.slug,
                is_demo: !!inv.is_demo,
                type: inv.type || "angel",
                bio,
                industries: inv.industries || [],
                stages,
                min_check,
                lead_rounds: !!inv.lead_rounds,
                created_at: inv.created_at,
                max_check,
                geography: inv.geography || [],
                subscription_tier: inv.subscription_tier,
                verified_at: inv.verified_at ?? null,
                number_of_investments: inv.number_of_investments ?? null,
                full_name: inv.display_name || null,
                firm: inv.firm_name || null,
              };
            })
            .filter((inv) => meetsDirectoryBar(inv));
          setInvestors(mapped);
          setLoadError(false);
        }
      } catch {
        // A failed fetch must not render as "no investors yet" -- but a failed
        // TOP-UP still has the server's rows on screen, and replacing a
        // working directory with an error page would be the bigger lie.
        if (!toppingUp) setLoadError(true);
      }
      if (!toppingUp) setLoading(false);
    }
    fetchInvestors();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: st } = await supabase
        .from("startups").select("stage, industry").eq("owner_id", user.id).maybeSingle();
      if (st) setMyRaise({ stage: st.stage, industry: st.industry });
      const { data: inv } = await supabase
        .from("investors").select("id").eq("owner_id", user.id).maybeSingle();
      if (inv) {
        setViewerInvestorId(inv.id);
        // The filled bookmarks, read back from the watchlist the save button
        // writes to -- same pattern as startups-search's saved-startup read.
        const { data: watched } = await supabase
          .from("watchlists").select("target_investor_id").not("target_investor_id", "is", null).limit(1000);
        setSavedInvestorTargetIds(new Set((watched ?? []).map((w: { target_investor_id: string | null }) => w.target_investor_id as string)));
      }
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

  // Whether "Documents on file" could ever match anyone in the loaded set.
  // Distinguishes "your filters were too narrow" (clearing them helps) from
  // "nobody here is verified yet" (clearing them would not help at all) --
  // today, with both real investors unverified, checking this box always
  // lands on the honest-but-unhelpful case.
  const anyVerifiedLoaded = useMemo(() => investors.some((i) => !!i.verified_at), [investors]);

  // Compare tray, mirroring the startups directory.
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  useEscapeKey(showCompare, () => setShowCompare(false));
  useEscapeKey(sidebarOpen, () => setSidebarOpen(false));
  function exportInvestorsCsv() {
    const esc = (v: unknown) => { const x = String(v ?? ""); const g = /^[=+\-@]/.test(x) ? `'${x}` : x; return `"${g.replace(/"/g, '""')}"`; };
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

  const INV_PAGE_SIZE = 24;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [f]);

  // Bumped on every filter/sort change, so a card keyed on it remounts and
  // its .card-reveal entrance plays again for the WHOLE grid, not just once
  // on first paint. A "load more" page bump does not touch this -- already
  // -rendered cards keep their key and stay put; only the newly appended
  // rows are new elements, so only they play the entrance.
  const [revealGen, setRevealGen] = useState(0);
  useEffect(() => { setRevealGen((g) => g + 1); }, [f]);

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
      // Matches on documents actually filed (admin-granted, migration 049).
      // It used to match subscription_tier !== "free", i.e. "pays us", which
      // is not a record of anything and misled the founders using it.
      const matchVerified = !f.verifiedOnly || !!inv.verified_at;
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
    else if (f.sort === "active") list = [...list].sort((a, b) => (b.number_of_investments || 0) - (a.number_of_investments || 0));

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
    <aside className="w-64 flex-shrink-0 space-y-4 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto"
      style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule)", borderRadius: "6px", padding: "16px" }}>
      <div className="flex items-center justify-between">
        <div className="ruled-label">
          {t("investors.filters")}
          {activeCount > 0 && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", letterSpacing: 0 }}>{activeCount}</span>
          )}
        </div>
        {activeCount > 0 && (
          <button onClick={() => setF(DEFAULT)}
            style={{ display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-4)", padding: "4px 0" }}>
            <X style={{ width: 11, height: 11 }} /> {t("investors.clear")}
          </button>
        )}
      </div>

      <div style={{ height: 1, background: "var(--cr-rule)" }} />

      {/* Sort */}
      <Section title={t("investors.sortBy")}>
        <div className="space-y-1">
          {([
            ["recent",       t("investors.sortRecent")],
            ["check_desc",   t("investors.sortLargest")],
            ["check_asc",    t("investors.sortSmallest")],
            ["name",         t("investors.sortName")],
            ["active",       t("investors.sortActive")],
            ...(myRaise ? [["fit", t("investors.sortFit")] as const] : []),
          ] as const).map(([val, label]) => (
            <button key={val} onClick={() => setF(p => ({ ...p, sort: val }))}
              className={cn("w-full text-left transition-colors", f.sort === val ? "" : "hover:bg-cr-p3")}
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: f.sort === val ? 600 : 400, fontSize: "13px", padding: "8px 12px", borderRadius: "4px", border: "none", cursor: "pointer", background: f.sort === val ? "var(--cr-copper-bg)" : "transparent", color: f.sort === val ? "var(--cr-copper)" : "var(--cr-ink-3)" }}
            >{label}</button>
          ))}
        </div>
      </Section>

      {/* Both checkboxes name a real thing (a self-reported claim vs. an
          admin-run review), and neither said so anywhere on this surface --
          a founder had to already have found a verified badge on a profile
          page to learn what "Documents on file" even tracks. The title
          attribute reuses the same distinction WhatWeChecked spells out in
          full on the profile page, compressed to a native tooltip here. */}
      <label className="flex items-center gap-2 cursor-pointer select-none" style={{ minHeight: "36px" }}
        title={tf("investors.leadOnlyHint", "Self-reported by the investor -- not a verified track record")}>
        <Checkbox checked={f.leadOnly} onCheckedChange={(v) => setF(p => ({ ...p, leadOnly: v === true }))} />
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)" }}>{t("investors.leadOnly")}</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer select-none" style={{ minHeight: "36px" }}
        title={tf("investors.verifiedOnlyHint", "Investors who completed CapitalReach's admin-run document verification -- not the same as a paid plan")}>
        <Checkbox checked={f.verifiedOnly} onCheckedChange={(v) => setF(p => ({ ...p, verifiedOnly: v === true }))} />
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)" }}>{t("investors.verifiedOnly")}</span>
      </label>
      {myRaise && (
        <label className="flex items-center gap-2 cursor-pointer select-none" style={{ minHeight: "36px" }}>
          <Checkbox checked={f.fitOnly} onCheckedChange={(v) => setF(p => ({ ...p, fitOnly: v === true }))} />
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)" }}>{t("investors.fitOnly")}</span>
        </label>
      )}
      <label className="flex items-center gap-2 cursor-pointer select-none" style={{ minHeight: "36px" }}>
        <Checkbox checked={f.newOnly} onCheckedChange={(v) => setF(p => ({ ...p, newOnly: v === true }))} />
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)" }}>{t("investors.newMonth")}</span>
      </label>

      <div style={{ height: 1, background: "var(--cr-rule)" }} />

      {/* Investor type */}
      <Section title={t("investors.investorType")} count={f.types.length}>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(TYPE_META).map(([val, meta]) => (
            <FilterChip key={val} active={f.types.includes(val)} onClick={() => toggle("types", val)}>
              {t(meta.labelKey)}{typeCounts[val] ? ` (${typeCounts[val]})` : ""}
            </FilterChip>
          ))}
        </div>
      </Section>

      <div style={{ height: 1, background: "var(--cr-rule)" }} />

      {/* Check size */}
      <Section title={t("investors.checkSizeRange")} count={(f.minCheck > 0 ? 1 : 0) + (f.maxCheck < 100_000_000 ? 1 : 0)}>
        <div className="px-1 pt-1">
          <Slider
            min={0} max={100_000_000} step={100_000}
            value={[f.minCheck, f.maxCheck]}
            onValueChange={([min, max]) => setF(p => ({ ...p, minCheck: min, maxCheck: max }))}
          />
          <div className="flex justify-between mt-2"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)" }}>
            <span>{formatCheck(f.minCheck)}</span>
            <span>{f.maxCheck >= 100_000_000 ? t("investors.noMax") : formatCheck(f.maxCheck)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {([[0, 100_000, "<$100K"], [100_000, 1_000_000, "$100K–$1M"], [1_000_000, 100_000_000, "$1M+"]] as const).map(([min, max, label]) => {
              const active = f.minCheck === min && f.maxCheck === max;
              return (
                <FilterChip key={label} active={active}
                  onClick={() => setF(p => ({ ...p, minCheck: active ? 0 : min, maxCheck: active ? 100_000_000 : max }))}>
                  {label}
                </FilterChip>
              );
            })}
          </div>
        </div>
      </Section>

      <div style={{ height: 1, background: "var(--cr-rule)" }} />

      {/* Stages */}
      <Section title={t("investors.investmentStage")} count={f.stages.length}>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map(s => (
            <FilterChip key={s.value} active={f.stages.includes(s.value)} onClick={() => toggle("stages", s.value)}>
              {s.label}
            </FilterChip>
          ))}
        </div>
      </Section>

      <div style={{ height: 1, background: "var(--cr-rule)" }} />

      {/* Industries */}
      <Section title={t("investors.focusIndustries")} count={f.industries.length} defaultOpen={false}>
        <div className="max-h-44 overflow-y-auto space-y-0.5 pr-1">
          {INDUSTRIES.map(ind => (
            <label key={ind} className={cn(
              "flex items-center gap-2 cursor-pointer transition-colors",
              f.industries.includes(ind) ? "" : "hover:bg-cr-p3"
            )}
              style={{ padding: "8px", borderRadius: "4px", background: f.industries.includes(ind) ? "var(--cr-copper-bg)" : undefined }}>
              <Checkbox checked={f.industries.includes(ind)} onCheckedChange={() => toggle("industries", ind)} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)" }}>{ind}</span>
            </label>
          ))}
        </div>
      </Section>

      <div style={{ height: 1, background: "var(--cr-rule)" }} />

      {/* Geography -- options come from the loaded investors, so the list never
          offers a country with zero investors behind it. */}
      <Section title={t("investors.geography")} count={f.geographies.length} defaultOpen={false}>
        <div className="max-h-44 overflow-y-auto space-y-0.5 pr-1">
          {allGeographies.map(geo => (
            <label key={geo} className={cn(
              "flex items-center gap-2 cursor-pointer transition-colors",
              f.geographies.includes(geo) ? "" : "hover:bg-cr-p3"
            )}
              style={{ padding: "8px", borderRadius: "4px", background: f.geographies.includes(geo) ? "var(--cr-copper-bg)" : undefined }}>
              <Checkbox checked={f.geographies.includes(geo)} onCheckedChange={() => toggle("geographies", geo)} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)" }}>{geo}</span>
            </label>
          ))}
        </div>
      </Section>
    </aside>
  );

  return (
    <main className="container mx-auto px-4 py-12 max-w-6xl">
      {/* Header -- the startups directory register: ruled label opener,
          serif italic display title, quiet factual sub, hairline underneath. */}
      <div style={{ borderBottom: "1px solid var(--cr-rule)", paddingBottom: "24px", marginBottom: "32px" }}>
        <div className="ruled-label" style={{ marginBottom: "12px" }}>
          {loading
            ? t("common.loading")
            : investors.length === 1
              ? t("investors.registeredCountOne")
              : t("investors.registeredCount", { count: investors.length })}
        </div>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(32px, 4vw, 48px)", color: "var(--cr-ink)", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: "8px" }}>
          {t("investors.directoryTitle")}
        </h1>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-3)", lineHeight: 1.65, maxWidth: "56ch" }}>
          {t("investors.directorySub")}
        </p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Sidebar -- desktop */}
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
                className="w-full h-11 pl-10 pr-4 focus:outline-none"
                style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink)" }}
                onFocusCapture={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-copper)")}
                onBlurCapture={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--cr-rule-dark)")}
              />
              {suggestOpen && f.query.trim().length < 2 && recent.length > 0 && (
                <div className="absolute top-full left-0 w-full max-w-sm overflow-hidden z-50"
                  style={{ marginTop: "8px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", boxShadow: "var(--cr-card-shadow-hover)" }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "12px 12px 8px" }}>
                    {t("startups.recentSearches")}
                  </p>
                  {recent.slice(0, 5).map((term) => (
                    <div key={term} className="flex items-center justify-between gap-2" style={{ padding: "8px 12px" }}>
                      <button onMouseDown={(e) => { e.preventDefault(); setF(p => ({ ...p, query: term })); }}
                        className="flex items-center gap-2 flex-1 text-left"
                        style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-2)", padding: 0 }}>
                        <Clock className="h-3 w-3 text-cr-i4 shrink-0" /> {term}
                      </button>
                      <button onMouseDown={(e) => { e.preventDefault(); forgetQuery(term); }} aria-label={`remove ${term}`}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-4)", fontSize: "13px", lineHeight: 1, padding: 0 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {suggestOpen && f.query.trim().length >= 2 && (() => {
                const hits = investors
                  .filter(i => (i.full_name || "").toLowerCase().includes(f.query.trim().toLowerCase()))
                  .slice(0, 6);
                return hits.length > 0 ? (
                  <div className="absolute top-full left-0 w-full max-w-sm overflow-hidden z-50"
                    style={{ marginTop: "8px", background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", boxShadow: "var(--cr-card-shadow-hover)" }}>
                    {hits.map((i, hi) => (
                      <Link key={i.id} href={`/investors/${i.slug}`}
                        className={cn("flex flex-col gap-0.5 hover:bg-cr-p3 no-underline", hi === suggestIdx && "bg-cr-p3")}
                        style={{ padding: "8px 12px", borderBottom: "1px solid var(--cr-rule)" }}>
                        <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "13px", color: "var(--cr-ink)" }}>{i.full_name}</span>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{t((TYPE_META[i.type] ?? TYPE_META.angel).labelKey)}{i.firm ? ` · ${i.firm}` : ""}</span>
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
              className="lg:hidden inline-flex items-center gap-2 h-11 px-4"
              style={{ background: sidebarOpen ? "var(--cr-copper-bg)" : "var(--cr-paper-2)", border: sidebarOpen ? "1px solid var(--cr-copper-br)" : "1px solid var(--cr-rule)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: sidebarOpen ? "var(--cr-copper)" : "var(--cr-ink-3)", cursor: "pointer", flexShrink: 0 }}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {t("investors.filters")} {activeCount > 0 && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px" }}>({activeCount})</span>}
            </button>
          </div>

          {/* Mobile: the same filter block as a full-height bottom sheet --
              header pinned, filters scroll, Reset / Apply·n pinned. */}
          {sidebarOpen && (
            <div role="dialog" aria-modal="true" aria-label={t("investors.filters")} className="lg:hidden" style={{ position: "fixed", inset: 0, zIndex: 50 }}>
              <div className="animate-fade-in" style={{ position: "absolute", inset: 0, background: "var(--cr-scrim)" }} onClick={() => setSidebarOpen(false)} />
              <div className="animate-fade-up" style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "var(--cr-paper-2)", borderRadius: "6px 6px 0 0", height: "min(92vh, 100dvh - 24px)", display: "flex", flexDirection: "column", boxShadow: "var(--cr-card-shadow-hover)" }}>
                <div style={{ padding: "12px 16px 0px", flexShrink: 0 }}>
                  <div style={{ width: 36, height: 4, background: "var(--cr-paper-4)", borderRadius: "2px", margin: "0 auto 4px" }} />
                </div>
                <div className="investor-sheet-body" style={{ overflowY: "auto", flex: 1, padding: "8px 12px 8px" }}>
                  {Sidebar}
                </div>
                <div style={{ flexShrink: 0, background: "var(--cr-paper-2)", borderTop: "1px solid var(--cr-rule)", padding: "12px 24px calc(12px + env(safe-area-inset-bottom, 0px))", display: "flex", gap: "8px" }}>
                  <button onClick={() => setF(DEFAULT)}
                    style={{ flex: 1, height: "44px", background: "transparent", border: "1px solid var(--cr-paper-4)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-ink-3)", cursor: "pointer" }}>
                    {t("filters.reset")}
                  </button>
                  <button onClick={() => setSidebarOpen(false)}
                    style={{ flex: 1.4, height: "44px", background: "var(--cr-copper)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-on-accent)", cursor: "pointer" }}>
                    {t("filters.applyCount", { count: results.length })}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Compare tray + modal, mirroring the startups directory */}
          {compareIds.length > 0 && (
            <div style={{ position: "fixed", bottom: "calc(18px + var(--cr-tabbar-h, 0px))", left: "50%", transform: "translateX(-50%)", zIndex: 60, display: "flex", alignItems: "center", gap: "12px", background: "var(--cr-band-bg)", borderRadius: "6px", padding: "12px 16px", boxShadow: "var(--cr-card-shadow-hover)" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "var(--cr-band-ink)" }}>
                {compareIds.map(id => investors.find(i => i.id === id)?.full_name).filter(Boolean).join(" · ")}
              </span>
              {/* Token, not text-white: on-accent ink is themed like all else. */}
              <button onClick={() => setShowCompare(true)} disabled={compareIds.length < 2}
                style={{ background: "var(--cr-copper)", color: "var(--cr-on-accent)", border: "none", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "12px", padding: "8px 16px", cursor: compareIds.length < 2 ? "default" : "pointer", opacity: compareIds.length < 2 ? 0.5 : 1 }}>
                {t("investors.compare2")} (<span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{compareIds.length}</span>)
              </button>
              <button onClick={() => setCompareIds([])} aria-label={t("investors.clearCompareAria")}
                style={{ background: "none", border: "none", color: "var(--cr-band-ink-dim)", cursor: "pointer", display: "flex", padding: 0 }}>
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
              <div role="dialog" aria-modal="true" className="fixed inset-0 z-[70]">
                <div className="absolute inset-0 bg-[color:var(--cr-scrim)]" onClick={() => setShowCompare(false)} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,760px)] max-h-[84vh] overflow-y-auto"
                  style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", padding: "24px" }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: "16px" }}>
                    <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "22px", color: "var(--cr-ink)" }}>{t("investors.compareInvestors")}</h2>
                    <button onClick={() => setShowCompare(false)} aria-label={t("common.close")}
                      style={{ background: "none", border: "none", color: "var(--cr-ink-4)", cursor: "pointer", display: "flex", padding: 0 }}><X className="h-5 w-5" /></button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="w-[130px]" />
                          {rows.map(i => (
                            <th key={i.id} className="text-left" style={{ padding: "8px 12px", borderBottom: "2px solid var(--cr-copper)" }}>
                              <Link href={`/investors/${i.slug}`} className="no-underline" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)" }}>
                                {i.full_name}
                              </Link>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {METRICS.map(m => {
                          // Check size is the one numeric row; it renders in mono.
                          const isNum = m.label === t("investors.checkSize");
                          return (
                            <tr key={m.label}>
                              <td style={{ padding: "8px 12px 8px 0px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid var(--cr-rule)" }}>{m.label}</td>
                              {rows.map(i => (
                                <td key={i.id} style={{ padding: "8px 12px", fontFamily: isNum ? "'JetBrains Mono', monospace" : "'DM Sans', sans-serif", fontWeight: isNum ? 500 : 300, fontSize: "13px", color: "var(--cr-ink)", borderBottom: "1px solid var(--cr-rule)" }}>{m.get(i)}</td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Same one-click shortcuts as the startups directory. */}
          <div style={{ marginBottom: "16px" }}>
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
                <AppliedChip key={`g-${g}`} label={countryLabel(t, g)} onRemove={() => toggle("geographies", g)} />
              ))}
              {f.minCheck > 0 && <AppliedChip label={`≥ ${formatCheck(f.minCheck)}`} onRemove={() => setF(p => ({ ...p, minCheck: 0 }))} />}
              {f.maxCheck < 100_000_000 && <AppliedChip label={`≤ ${formatCheck(f.maxCheck)}`} onRemove={() => setF(p => ({ ...p, maxCheck: 100_000_000 }))} />}
              {f.leadOnly && <AppliedChip label={t("investors.leadOnly")} onRemove={() => setF(p => ({ ...p, leadOnly: false }))} />}
              {f.verifiedOnly && <AppliedChip label={t("investors.verifiedOnly")} onRemove={() => setF(p => ({ ...p, verifiedOnly: false }))} />}
              <button onClick={() => setF(p => ({ ...DEFAULT, query: p.query }))}
                style={{ display: "flex", alignItems: "center", gap: "4px", background: "transparent", border: "1px solid var(--cr-paper-4)", borderRadius: "4px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-4)", padding: "4px 12px", cursor: "pointer", marginLeft: "4px" }}>
                {t("investors.clearAllFilters")}
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-cr-copper" />
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>{t("investors.loadingInvestors")}</p>
            </div>
          ) : loadError ? (
            <div style={{ border: "1px dashed var(--cr-rule-dark)", borderRadius: "6px", background: "var(--cr-paper-2)", padding: "48px 24px", textAlign: "center" }}>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "12px" }}>{t("errorPage.sectionTitle")}</p>
              <button onClick={() => window.location.reload()}
                style={{ background: "transparent", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "8px 16px", minHeight: "40px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-3)" }}>
                {t("errorPage.retry")}
              </button>
            </div>
          ) : investors.length === 0 ? (
            /* No investors yet -- one diamond, one sentence, one quiet action. */
            <div style={{ border: "1px solid var(--cr-rule)", borderRadius: "6px", background: "var(--cr-paper-2)", padding: "64px 24px", textAlign: "center" }}>
              <span aria-hidden style={{ display: "block", color: "var(--cr-copper)", fontSize: "15px", marginBottom: "16px" }}>✦</span>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "8px" }}>{t("investors.noInvestorsYet")}</p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.65, maxWidth: "40ch", margin: "0 auto 24px" }}>
                {t("investors.noInvestorsYetSub")}
              </p>
              <Link
                href="/auth/signup?role=investor"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "transparent", color: "var(--cr-ink)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", minHeight: "40px", padding: "12px 24px", borderRadius: "999px", border: "1px solid var(--cr-paper-4)", textDecoration: "none" }}
              >
                {t("investors.joinAsInvestor")} →
              </Link>
            </div>
          ) : (
            <>
              {/* First-use callout for the watch/bookmark icon (migration 139).
                  Only investor viewers ever see the icon at all (it's hidden
                  on a viewer's own card and absent for founders), so the hint
                  is gated the same way. Dismissed for good the first time it's
                  closed or read -- not re-shown per visit. */}
              {viewerInvestorId && showWatchHint && (
                <div className="flex items-center justify-between gap-3 flex-wrap"
                  style={{ background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", borderRadius: "4px", padding: "10px 14px", marginBottom: "16px" }}>
                  <p className="flex items-center gap-2" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", margin: 0 }}>
                    <Bookmark className="h-3.5 w-3.5 flex-shrink-0" />
                    {tf("investors.watchHint", "New: save fellow investors to a private watchlist. Look for the bookmark icon on each card.")}
                  </p>
                  <button onClick={dismissWatchHint} aria-label={t("common.close")}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cr-copper)", padding: "8px", display: "flex", flexShrink: 0 }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Result count */}
              <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: "24px" }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)" }}>
                  {results.length === 1
                    ? t("investors.foundCountOne")
                    : t("investors.foundCount", { count: results.length })}
                  {f.query && <span style={{ marginLeft: "4px" }}>{t("investors.forQuery")} &ldquo;<em>{f.query}</em>&rdquo;</span>}
                  {results.length > 0 && (
                    <span style={{ marginLeft: "8px" }}>
                      · {t("investors.combinedCapacity", { count: results.length, sum: formatCheck(results.reduce((a, i) => a + (i.max_check || 0), 0)) })}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  {activeCount > 0 && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(window.location.href); notify.success(t("startups.linkCopied2")); }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "underline", textUnderlineOffset: "3px", padding: 0 }}>
                      {t("investors.copyLink")}
                    </button>
                  )}
                  {results.length > 0 && (
                    <button onClick={exportInvestorsCsv}
                      style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-copper)", textDecoration: "underline", textUnderlineOffset: "3px", padding: 0 }}>
                      {t("investors.exportCsv2")}
                    </button>
                  )}
                  {activeCount > 0 && (
                    <button onClick={() => setF(DEFAULT)} className="flex items-center gap-1"
                      style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "12px", color: "var(--cr-ink-4)", padding: 0 }}>
                      <X className="h-3 w-3" /> {t("investors.clearFilters")}
                    </button>
                  )}
                </div>
              </div>

              {/* Investor grid */}
              {results.length === 0 ? (
                f.verifiedOnly && !anyVerifiedLoaded ? (
                  /* "Clear filters" is not the honest answer here: no amount
                     of filter-clearing produces a verified investor when
                     nobody in the directory has been through review yet. Say
                     the real reason, and offer to drop only THIS filter
                     rather than the whole search. */
                  <EmptyState
                    Icon={Users}
                    title={tf("investors.noneVerifiedYet", "No investors have documents on file yet")}
                    body={tf("investors.noneVerifiedYetSub", "Nobody in the directory has completed CapitalReach's verification review yet -- this isn't about your other filters.")}
                    action={
                      <button onClick={() => setF(p => ({ ...p, verifiedOnly: false }))}
                        style={{ background: "transparent", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", minHeight: "40px", padding: "8px 16px", borderRadius: "4px", border: "1px solid var(--cr-rule-dark)", cursor: "pointer" }}>
                        {tf("investors.showUnverifiedToo", "Show all investors")}
                      </button>
                    }
                  />
                ) : (
                  /* The shared shell, same as the startups browse -- every list
                     surface's dead end should look like the same product. */
                  <EmptyState
                    Icon={Users}
                    title={t("investors.noMatch")}
                    body={t("investors.noMatchSub")}
                    action={
                      <button onClick={() => setF(DEFAULT)}
                        style={{ background: "transparent", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", minHeight: "40px", padding: "8px 16px", borderRadius: "4px", border: "1px solid var(--cr-rule-dark)", cursor: "pointer" }}>
                        {t("investors.clearAllFilters")}
                      </button>
                    }
                  />
                )
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {results.slice(0, page * INV_PAGE_SIZE).map((inv, i) => {
                    const meta = TYPE_META[inv.type] ?? TYPE_META.angel;
                    const displayName = inv.full_name || t("investors.anonymousInvestor");
                    return (
                      // Outer wrapper carries the entrance (fades the whole
                      // card, overlay link included, as one unit) and hosts
                      // the stretched link under everything else. Keyed on
                      // revealGen so a filter/sort change remounts every card
                      // and the stagger plays again; a page bump below leaves
                      // already-rendered cards' keys untouched, so only the
                      // freshly appended rows animate in.
                      <div key={`${revealGen}-${inv.id}`} className="card-reveal relative"
                        style={{ "--reveal-i": i % 12 } as React.CSSProperties}>
                        <div className="cr-lift cr-spot cr-tilt group relative flex flex-col"
                          style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "6px", padding: "16px", transition: "border-color 120ms ease, transform 180ms ease, box-shadow 180ms ease" }}
                          onMouseMove={e => {
                            const r = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - r.left, y = e.clientY - r.top;
                            e.currentTarget.style.setProperty("--mx", `${x}px`);
                            e.currentTarget.style.setProperty("--my", `${y}px`);
                            e.currentTarget.style.setProperty("--ry", `${((x / r.width) - 0.5) * 5}deg`);
                            e.currentTarget.style.setProperty("--rx", `${(0.5 - (y / r.height)) * 4}deg`);
                            e.currentTarget.style.borderColor = "var(--cr-paper-4)";
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.setProperty("--rx", "0deg");
                            e.currentTarget.style.setProperty("--ry", "0deg");
                            e.currentTarget.style.borderColor = "var(--cr-rule-dark)";
                          }}>
                          {/* Full-surface click target, same pattern as
                              StartupCard: a stretched anchor under the card,
                              with every interactive control lifted to z-index
                              2 so its own click lands on it, not the link. It
                              has to live INSIDE this tilting div, not beside
                              it: .cr-tilt's `transform` (present at rest, not
                              just on hover) makes this div its own stacking
                              context, and a z-index inside a stacking context
                              can never out-rank an element placed OUTSIDE it,
                              however high that z-index is set -- nested here,
                              the link and every zIndex:2 control below are
                              compared within the SAME context, so 2 genuinely
                              beats this link's 1 again. */}
                          <Link
                            href={`/investors/${inv.slug}`}
                            aria-label={displayName}
                            style={{ position: "absolute", inset: 0, zIndex: 1, textDecoration: "none" }}
                          />
                          {/* Top */}
                          <div className="flex items-start justify-between" style={{ marginBottom: "16px" }}>
                            {/* 12px padding gives each icon a 40px tap target.
                                zIndex above the stretched link so these clicks
                                reach the buttons, not the card-wide anchor. */}
                            <div className="absolute top-1 right-1 flex items-center" style={{ zIndex: 2 }}>
                              {myRaise && (
                                <button
                                  onClick={async (e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    const res = await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ investorId: inv.id }) });
                                    if (res.ok) notify.success(t("targets.added")); else notify.error(t("targets.failed"));
                                  }}
                                  aria-label={t("investors.target2")} title={t("investors.target2")}
                                  className="text-cr-p4 hover:text-cr-copper transition-colors"
                                  style={{ background: "none", border: "none", cursor: "pointer", padding: "12px", display: "flex" }}>
                                  <Crosshair className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCompare(inv.id); }}
                                aria-label={t("investors.compare2")} title={t("investors.compare2")}
                                className={cn("transition-colors", compareIds.includes(inv.id) ? "text-cr-copper" : "text-cr-p4 hover:text-cr-copper")}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: "12px", display: "flex" }}>
                                <GitCompareArrows className="h-4 w-4" />
                              </button>
                              {/* An investor can watchlist another investor (migration 139) --
                                  a bookmark, gated on the viewer owning an investor entity and
                                  hidden on their own card. */}
                              {viewerInvestorId && viewerInvestorId !== inv.id && (
                                <InvestorWatchButton investorId={inv.id} initiallySaved={savedInvestorTargetIds.has(inv.id)} variant="icon" />
                              )}
                            </div>
                            <div className="flex items-center gap-3" style={{ paddingRight: "72px" }}>
                              <div style={{ width: 40, height: 40, borderRadius: "4px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-paper-4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-copper)" }}>
                                {displayName[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="leading-tight group-hover:text-cr-copper transition-colors" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "15px", color: "var(--cr-ink)", letterSpacing: "-0.01em" }}>
                                  {displayName}
                                  {(inv as { is_demo?: boolean }).is_demo && <span className="ml-1.5 align-middle inline-flex"><DemoBadge /></span>}
                                </p>
                                {inv.firm && <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginTop: "2px" }}>{inv.firm}</p>}
                                <div className="flex items-center flex-wrap gap-1.5" style={{ marginTop: "8px" }}>
                                  <span style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "2px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                    {t(meta.labelKey)}
                                  </span>
                                  {inv.lead_rounds && (
                                    <span title={tf("investors.leadOnlyHint", "Self-reported by the investor -- not a verified track record")}
                                      style={{ border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "2px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                      {t("investors.leadsRounds")}
                                    </span>
                                  )}
                                  {/* Outlined copper, not a filled pill: the
                                      card's one accent is the check-size figure,
                                      and this chip matches its siblings' 4px. */}
                                  {myRaise && (inv.stages || []).includes(myRaise.stage) && (inv.industries || []).includes(myRaise.industry) && (
                                    <span style={{ background: "transparent", border: "1px solid var(--cr-copper-br)", color: "var(--cr-copper)", borderRadius: "4px", padding: "2px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                      {t("investors.fitsYourRaise")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Bio */}
                          {inv.bio && (
                            <p className="line-clamp-2 flex-1" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-3)", lineHeight: 1.65, marginBottom: "16px" }}>{inv.bio}</p>
                          )}

                          {/* Check size -- the card's number, on its own ruled strip. */}
                          {(inv.min_check || inv.max_check) && (
                            <div style={{ borderTop: "1px solid var(--cr-rule)", padding: "8px 0 0", marginBottom: "12px" }}>
                              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>{t("investors.checkSize")}</p>
                              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "15px", color: "var(--cr-copper)" }}>
                                {inv.min_check ? formatCheck(inv.min_check) : t("investors.any")} – {inv.max_check ? formatCheck(inv.max_check) : t("investors.any")}
                              </p>
                            </div>
                          )}

                          {/* Stages */}
                          {inv.stages && inv.stages.length > 0 && (
                            <div className="flex flex-wrap gap-1" style={{ marginBottom: "12px" }}>
                              {inv.stages.map(s => (
                                <span key={s} style={{ border: "1px solid var(--cr-paper-4)", borderRadius: "4px", padding: "2px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                  {STAGE_LABELS[s] ?? s}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Industries -- a dead static "+N" used to sit here;
                              it now opens inline via <details>, the same
                              progressive-disclosure convention the profile
                              page's portfolio list already uses. Elevated
                              above the stretched link (zIndex 2) so a click
                              toggles it instead of navigating away. */}
                          {inv.industries && inv.industries.length > 0 && (
                            <div className="flex flex-wrap gap-1 items-start" style={{ marginBottom: "12px" }}>
                              {inv.industries.slice(0, 3).map(ind => (
                                <span key={ind} style={{ border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "2px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", color: "var(--cr-ink-4)" }}>{ind}</span>
                              ))}
                              {inv.industries.length > 3 && (
                                <details data-cr-expander style={{ position: "relative", zIndex: 2 }}>
                                  <summary
                                    style={{
                                      listStyle: "none", cursor: "pointer",
                                      border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "2px 8px",
                                      fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)",
                                    }}
                                  >
                                    +{inv.industries.length - 3}
                                  </summary>
                                  <div className="flex flex-wrap gap-1" style={{ marginTop: "4px" }}>
                                    {inv.industries.slice(3).map(ind => (
                                      <span key={ind} style={{ border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "2px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "11px", color: "var(--cr-ink-4)" }}>{ind}</span>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          )}

                          {/* Geography */}
                          {inv.geography && inv.geography.length > 0 && (
                            <div className="flex items-center gap-1.5" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "12px", color: "var(--cr-ink-4)", marginBottom: "12px" }}>
                              <Globe className="h-3 w-3" />
                              {inv.geography.slice(0, 2).map(g => countryLabel(t, g)).join(" · ")}
                              {inv.geography.length > 2 && ` +${inv.geography.length - 2}`}
                            </div>
                          )}

                          {/* CTA -- quiet tertiary; the page keeps one primary.
                              Above the stretched link (zIndex 2): the whole
                              card already navigates here, this just keeps its
                              own visible target working exactly as before. */}
                          <Link
                            href={`/investors/${inv.slug}`}
                            className="mt-auto w-full flex items-center gap-2"
                            style={{ position: "relative", zIndex: 2, minHeight: "40px", paddingTop: "12px", borderTop: "1px solid var(--cr-rule)", textDecoration: "none", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-copper)" }}
                          >
                            {t("investors.viewProfile")} →
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Load more -- same 24-a-page rhythm as the startup directory. */}
              {results.length > page * INV_PAGE_SIZE && (
                <div className="mt-10 flex justify-center">
                  <button onClick={() => setPage(p => p + 1)}
                    style={{ background: "transparent", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", padding: "12px 32px", minHeight: "40px", borderRadius: "4px", border: "1px solid var(--cr-copper-br)", cursor: "pointer" }}>
                    {t("startups.loadMore", { count: Math.min(INV_PAGE_SIZE, results.length - page * INV_PAGE_SIZE) })}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Bottom CTA -- the page's one band moment, and its one primary. */}
          {!loading && (
            <div className="mt-16 flex flex-col md:flex-row md:items-center justify-between gap-6"
              style={{ background: "var(--cr-band-bg)", borderTop: "1px solid var(--cr-copper-br)", borderBottom: "1px solid var(--cr-copper-br)", borderRadius: "6px", padding: "32px" }}>
              <div>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(22px, 3vw, 28px)", color: "var(--cr-band-ink)", letterSpacing: "-0.01em", marginBottom: "8px" }}>{t("investors.readyFunded")}</h2>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-band-ink-dim)", lineHeight: 1.6 }}>{t("investors.readyFundedSub")}</p>
              </div>
              <Link href="/auth/signup?role=startup"
                className="whitespace-nowrap flex-shrink-0"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "var(--cr-copper)", color: "var(--cr-on-accent)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", padding: "12px 24px", borderRadius: "999px", border: "none", textDecoration: "none" }}>
                {t("investors.listYourStartup")} →
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
