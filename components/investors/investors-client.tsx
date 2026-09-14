"use client";

/* Hallmark · genre: modern-minimal · surface: investor directory · macrostructure: Index-First ledger */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { announce } from "@/lib/announce";
import { countryLabel } from "@/lib/country-label";
import { STAGE_LABELS } from "@/lib/utils";
import { STAGES } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";
import { PageHeader } from "@/components/ui/page-header";
import { Ledger, LedgerCell, LedgerHead, LedgerRow } from "@/components/ui/ledger";
import {
  FilterBar,
  FilterMenu,
  FilterSearch,
  FilterToggle,
  SortSelect,
  type FilterOption,
  type SortOption,
} from "@/components/ui/filter-bar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

type Investor = {
  id: string;
  slug: string;
  type: string;
  bio: string | null;
  industries: string[];
  stages: string[];
  min_check: number | null;
  max_check: number | null;
  geography: string[];
  subscription_tier: string | null;
  verified_at: string | null;
  lead_rounds: boolean;
  number_of_investments: number | null;
  created_at: string;
  is_demo?: boolean;
  full_name: string | null;
  firm: string | null;
};

type RawInvestorRow = {
  id: string;
  slug: string;
  type: string | null;
  bio: string | null;
  industries: string[] | null;
  stages: string[] | null;
  min_check: number | null;
  max_check: number | null;
  geography: string[] | null;
  subscription_tier: string | null;
  verified_at: string | null;
  lead_rounds: boolean | null;
  number_of_investments: number | null;
  created_at: string;
  display_name: string | null;
  firm_name: string | null;
  is_demo: boolean | null;
};

type Raise = { stage: string; industry: string };
type SortKey = "fit" | "recent" | "check_desc";
type CheckBand = "under_100k" | "100k_1m" | "1m_plus";
type Vars = Record<string, string | number>;

type Filters = {
  query: string;
  stages: string[];
  check: CheckBand | null;
  lead: boolean;
  verified: boolean;
  types: string[];
  sectors: string[];
  regions: string[];
  /** null follows the viewer's default: Best fit for founders, Recently joined otherwise. */
  sort: SortKey | null;
};

const NO_FILTERS: Pick<Filters, "stages" | "check" | "lead" | "verified" | "types" | "sectors" | "regions"> = {
  stages: [],
  check: null,
  lead: false,
  verified: false,
  types: [],
  sectors: [],
  regions: [],
};

const TYPE_LABEL_KEYS: Record<string, string> = {
  angel: "investors.typeAngel",
  vc: "investors.typeVc",
  family_office: "investors.typeFamilyOffice",
  corporate: "investors.typeCorporate",
};

const CHECK_BANDS: ReadonlyArray<{ value: CheckBand; label: string; lo: number; hi: number }> = [
  { value: "under_100k", label: "<$100K", lo: 0, hi: 100_000 },
  { value: "100k_1m", label: "$100K–$1M", lo: 100_000, hi: 1_000_000 },
  { value: "1m_plus", label: "$1M+", lo: 1_000_000, hi: Number.POSITIVE_INFINITY },
];

const INVESTOR_COLUMNS =
  "id, slug, type, bio, industries, stages, min_check, max_check, geography, subscription_tier, verified_at, lead_rounds, number_of_investments, created_at, display_name, firm_name, is_public, is_demo";

// The loading skeleton in app/investors/loading.tsx repeats these tracks.
const COLUMNS = "minmax(0,1.2fr) minmax(0,1.4fr) auto";
const PAGE_SIZE = 24;
// The filter bar sticks only once the list is long enough to scroll past it.
const STICKY_AFTER = 12;
// Type and Sector & region are secondary: they need this many loaded rows.
const SECONDARY_MIN_ROWS = 10;

const TITLE_LINE = "calc(0.9375rem * 1.4)";
const SUB_LINE = "calc(0.8125rem * 1.4)";
const FIGURE_LINE = "calc(0.9375rem * 1.55)";
const CAPS_LINE = "calc(0.6875rem * 1.4)";

/* ── Completeness bar and stage spellings ─────────────────────────────────
   The same bar and the same aliases as loadPublicInvestors in
   lib/browse-data.ts. The fallback fetch must never admit a row the server
   loader withholds, and a raw enum never renders. */
const DIRECTORY_MIN_BIO = 40;
const DIRECTORY_MAX_CHECK = 10_000_000_000;
const STAGE_ALIASES: Record<string, string> = {
  "pre-seed": "pre-seed",
  pre_seed: "pre-seed",
  preseed: "pre-seed",
  seed: "seed",
  series_a: "series_a",
  "series-a": "series_a",
  series_b_plus: "series_b_plus",
  series_b: "series_b_plus",
  "series-b": "series_b_plus",
  series_c: "series_b_plus",
  growth: "series_b_plus",
};
const STAGE_ORDER: string[] = STAGES.map((s) => s.value);

function hasOwn(record: Record<string, string>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function plausibleCheck(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= DIRECTORY_MAX_CHECK ? n : null;
}

function normaliseStages(stages: ReadonlyArray<unknown> | null | undefined): string[] {
  const found: string[] = [];
  for (const raw of stages ?? []) {
    const key = String(raw).trim().toLowerCase();
    if (hasOwn(STAGE_ALIASES, key)) found.push(STAGE_ALIASES[key]);
  }
  return STAGE_ORDER.filter((stage) => found.includes(stage));
}

function toDirectoryRow(inv: RawInvestorRow): Investor | null {
  const stages = normaliseStages(inv.stages);
  const min_check = plausibleCheck(inv.min_check);
  const max_check = plausibleCheck(inv.max_check);
  const bio = typeof inv.bio === "string" ? inv.bio.trim() : "";
  if (bio.length < DIRECTORY_MIN_BIO || (min_check === null && max_check === null) || stages.length === 0) return null;
  return {
    id: inv.id,
    slug: inv.slug,
    type: inv.type || "angel",
    bio,
    industries: inv.industries || [],
    stages,
    min_check,
    max_check,
    geography: inv.geography || [],
    subscription_tier: inv.subscription_tier,
    verified_at: inv.verified_at ?? null,
    lead_rounds: !!inv.lead_rounds,
    number_of_investments: inv.number_of_investments ?? null,
    created_at: inv.created_at,
    is_demo: !!inv.is_demo,
    full_name: inv.display_name || null,
    firm: inv.firm_name || null,
  };
}

/* ── Formatting ─────────────────────────────────────────────────────────── */

function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

function formatCheck(n: number) {
  if (n >= 999_500_000) {
    const b = n / 1_000_000_000;
    return `$${Number.isInteger(b) ? b : b.toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (n >= 999_500) {
    const m = n / 1_000_000;
    return `$${Number.isInteger(m) ? m : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function checkSpan(inv: Pick<Investor, "min_check" | "max_check">): [number, number] | null {
  if (inv.min_check === null && inv.max_check === null) return null;
  const lo = inv.min_check ?? 0;
  const hi = inv.max_check ?? Number.POSITIVE_INFINITY;
  return lo <= hi ? [lo, hi] : [hi, lo];
}

function inBand(inv: Investor, band: { lo: number; hi: number }) {
  const span = checkSpan(inv);
  return !!span && span[1] >= band.lo && span[0] < band.hi;
}

function largestCheck(inv: Investor) {
  return inv.max_check ?? inv.min_check ?? 0;
}

function formatCheckRange(inv: Investor, upTo: (amount: string) => string): string | null {
  const { min_check: min, max_check: max } = inv;
  if (min !== null && max !== null) {
    const lo = formatCheck(Math.min(min, max));
    const hi = formatCheck(Math.max(min, max));
    return lo === hi ? lo : `${lo}–${hi}`;
  }
  if (min !== null) return `${formatCheck(min)}+`;
  if (max !== null) return upTo(formatCheck(max));
  return null;
}

function formatList(items: string[], locale: string) {
  const ListFormat = (Intl as unknown as {
    ListFormat?: new (locale: string, options: { style: string; type: string }) => { format(list: string[]): string };
  }).ListFormat;
  if (!ListFormat) return items.join(", ");
  try {
    return new ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}

/** A menu is offered only when one of its options would actually narrow the loaded rows. */
function splitsRows(options: ReadonlyArray<FilterOption>, total: number) {
  return options.some((o) => (o.count ?? 0) > 0 && (o.count ?? 0) < total);
}

/* ── URL state ──────────────────────────────────────────────────────────── */

type ParamReader = { get(name: string): string | null };

function listParam(sp: ParamReader, key: string): string[] {
  return (sp.get(key) ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

function isBand(v: string | null): v is CheckBand {
  return CHECK_BANDS.some((b) => b.value === v);
}

function isSort(v: string | null): v is SortKey {
  return v === "fit" || v === "recent" || v === "check_desc";
}

function readCheck(sp: ParamReader): CheckBand | null {
  const named = sp.get("check");
  if (isBand(named)) return named;
  // Links from the retired range slider and presets carry the band as min/max.
  const min = Number(sp.get("min")) || 0;
  const max = Number(sp.get("max")) || 0;
  if (min === 0 && max === 100_000) return "under_100k";
  if (min === 100_000 && max === 1_000_000) return "100k_1m";
  if (min === 1_000_000 && (max === 0 || max >= 100_000_000)) return "1m_plus";
  return null;
}

function readFilters(sp: ParamReader): Filters {
  const sort = sp.get("sort");
  return {
    query: sp.get("q") ?? "",
    stages: normaliseStages(listParam(sp, "stages")),
    check: readCheck(sp),
    lead: sp.get("lead") === "1",
    verified: sp.get("verified") === "1",
    types: listParam(sp, "types").filter((v) => hasOwn(TYPE_LABEL_KEYS, v)),
    sectors: listParam(sp, "industries"),
    regions: listParam(sp, "geo"),
    sort: isSort(sort) ? sort : null,
  };
}

/* ── Styles (tokens only; geometry lives in the LEDGER SYSTEM classes) ──── */

const FRAME: CSSProperties = { maxWidth: "1100px", marginInline: "auto" };
const NAME_LINE: CSSProperties = { display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 };
const NAME: CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const MANDATE: CSSProperties = { color: "var(--cr-ink-2)" };
// Reserved on every row, so a fit marker that resolves late never moves a row.
const FIT_SLOT: CSSProperties = {
  display: "block",
  minHeight: SUB_LINE,
  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
  fontSize: "0.8125rem",
  fontWeight: 500,
  lineHeight: 1.4,
  letterSpacing: 0,
  color: "var(--cr-ink)",
};
// cr-btn--text carries 0.5rem of inline padding; pulling it back lines the
// label up with the text column above it.
const TEXT_ACTION: CSSProperties = { marginInlineStart: "-0.5rem" };

/* ── Loading geometry (mirrors app/investors/loading.tsx) ───────────────── */

function SkeletonLine({ height, width, bar, end = false }: { height: string; width: string; bar: string; end?: boolean }) {
  return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: end ? "flex-end" : "flex-start" }}>
      <Skeleton w={width} h={bar} />
    </div>
  );
}

function DirectorySkeleton() {
  return (
    <div aria-hidden="true">
      <div className="cr-filterbar">
        <div className="cr-filterbar__row">
          <div className="cr-filterbar__search">
            <Skeleton w="100%" h="2.75rem" />
          </div>
          <div className="cr-filterbar__controls">
            <Skeleton w="4.5rem" h="2.75rem" />
            <Skeleton w="6rem" h="2.75rem" />
            <Skeleton w="9rem" h="2.75rem" />
          </div>
          <Skeleton w="5.5rem" h="2.75rem" className="cr-filterbar__sheet-btn" />
        </div>
      </div>
      <div className="cr-ledger" style={{ "--cr-ledger-cols": COLUMNS } as CSSProperties}>
        <div className="cr-colhead">
          <div className="cr-cell"><SkeletonLine height={CAPS_LINE} width="3.5rem" bar="0.5rem" /></div>
          <div className="cr-cell"><SkeletonLine height={CAPS_LINE} width="3.5rem" bar="0.5rem" /></div>
          <div className="cr-cell cr-cell--figure"><SkeletonLine height={CAPS_LINE} width="4.5rem" bar="0.5rem" end /></div>
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="cr-row" style={{ alignItems: "start" }}>
            <div className="cr-cell cr-cell--primary">
              <SkeletonLine height={TITLE_LINE} width="38%" bar="0.875rem" />
              <SkeletonLine height={SUB_LINE} width="56%" bar="0.625rem" />
              <SkeletonLine height={SUB_LINE} width="82%" bar="0.625rem" />
            </div>
            <div className="cr-cell">
              <SkeletonLine height={SUB_LINE} width="64%" bar="0.625rem" />
            </div>
            <div className="cr-cell cr-cell--figure">
              <SkeletonLine height={FIGURE_LINE} width="5rem" bar="0.875rem" end />
              <div style={{ height: SUB_LINE }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Directory ──────────────────────────────────────────────────────────── */

type InvestorsClientProps = {
  initialInvestors?: Investor[];
  initialIsPartial?: boolean;
  /** The viewer's own round, resolved on the server: null when they have none, undefined when unresolved. */
  initialRaise?: Raise | null;
};

export function InvestorsClient({ initialInvestors, initialIsPartial, initialRaise }: InvestorsClientProps = {}) {
  const { t, locale } = useTranslation();
  // /investors?q= mirrors /startups?q= so the global search's "see all" can
  // land on either directory pre-filtered. The whole filter set lives in the
  // URL: shareable, bookmarkable, back/forward-safe.
  const searchParams = useSearchParams();
  const [f, setF] = useState<Filters>(() => readFilters(searchParams));
  // Server-rendered rows (lib/browse-data) make the first paint the finished
  // directory; the client query below only runs when none were provided.
  const [investors, setInvestors] = useState<Investor[]>(initialInvestors ?? []);
  const [loading, setLoading] = useState(!initialInvestors);
  const [loadError, setLoadError] = useState(false);
  const [myRaise, setMyRaise] = useState<Raise | null>(initialRaise ?? null);
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  const tf = useCallback(
    (key: string, fallback: string, vars?: Vars) => {
      const value = t(key, vars);
      return value !== key ? value : interpolate(fallback, vars);
    },
    [t],
  );

  const tfCount = useCallback(
    (key: string, one: string, other: string, count: number, vars?: Vars) => {
      const all: Vars = { ...vars, count };
      const value = t(key, all);
      return value !== key ? value : interpolate(count === 1 ? one : other, all);
    },
    [t],
  );

  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }, []);

  const fetchInvestors = useCallback(
    async (toppingUp: boolean) => {
      if (!toppingUp) {
        setLoading(true);
        setLoadError(false);
      }
      try {
        // display_name / firm_name are the investor's own published fields;
        // profiles is not anonymously readable (019), so it is not joined.
        // is_external mirrors the server loader: off-platform contacts belong
        // to the startup that created them.
        const { data, error } = await getSupabase()
          .from("investors")
          .select(INVESTOR_COLUMNS)
          .eq("is_public", true)
          .eq("is_external", false)
          .order("created_at", { ascending: false });
        if (error) throw error;
        const rows = ((data ?? []) as unknown as RawInvestorRow[])
          .map(toDirectoryRow)
          .filter((row): row is Investor => row !== null);
        setInvestors(rows);
        setLoadError(false);
      } catch {
        // A failed first load must not read as "no investors"; a failed
        // top-up keeps the server's rows, which are still true.
        if (!toppingUp) setLoadError(true);
      }
      if (!toppingUp) setLoading(false);
    },
    [getSupabase],
  );

  // Mount only. A full server payload makes the round trip redundant; a
  // partial one is topped up quietly behind the rows already painted.
  useEffect(() => {
    if (initialInvestors && !initialIsPartial) return;
    void fetchInvestors(!!initialInvestors);
  }, []);

  // Mount only: the founder's own round, when the server could not resolve it.
  useEffect(() => {
    if (initialRaise !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase.from("startups").select("stage, industry").eq("owner_id", user.id).maybeSingle();
        const row = data as unknown as { stage?: string | null; industry?: string | null } | null;
        const stage = normaliseStages(row?.stage ? [row.stage] : [])[0];
        if (!cancelled && stage && row?.industry) setMyRaise({ stage, industry: row.industry });
      } catch {
        // Fit is an aid; the directory is complete without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // "/" jumps to search from anywhere on the page, unless already typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The URL always names the current search. Results never wait on this.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const p = new URLSearchParams();
      if (f.query) p.set("q", f.query);
      if (f.stages.length) p.set("stages", f.stages.join(","));
      if (f.check) p.set("check", f.check);
      if (f.lead) p.set("lead", "1");
      if (f.verified) p.set("verified", "1");
      if (f.types.length) p.set("types", f.types.join(","));
      if (f.sectors.length) p.set("industries", f.sectors.join(","));
      if (f.regions.length) p.set("geo", f.regions.join(","));
      if (f.sort) p.set("sort", f.sort);
      const qs = p.toString();
      const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      if (next !== window.location.pathname + window.location.search) {
        window.history.replaceState(window.history.state, "", next);
      }
    }, 150);
    return () => window.clearTimeout(id);
  }, [f]);

  useEffect(() => {
    setPage(1);
  }, [f]);

  const total = investors.length;

  const fits = useCallback(
    (inv: Investor) => !!myRaise && inv.stages.includes(myRaise.stage) && inv.industries.includes(myRaise.industry),
    [myRaise],
  );

  const sortKey: SortKey = f.sort === "fit" && !myRaise ? "recent" : f.sort ?? (myRaise ? "fit" : "recent");

  /* Options count rows in the loaded, unfiltered set. */

  const stageOptions = useMemo<FilterOption[]>(() => {
    const options = STAGES.map((s) => ({
      value: s.value as string,
      label: STAGE_LABELS[s.value] ?? s.label,
      count: investors.filter((inv) => inv.stages.includes(s.value)).length,
    }));
    return splitsRows(options, total) || f.stages.length > 0 ? options : [];
  }, [investors, total, f.stages.length]);

  const checkOptions = useMemo<FilterOption<CheckBand>[]>(() => {
    const options = CHECK_BANDS.map((band) => ({
      value: band.value,
      label: band.label,
      count: investors.filter((inv) => inBand(inv, band)).length,
    }));
    return splitsRows(options, total) || f.check !== null ? options : [];
  }, [investors, total, f.check]);

  const typeOptions = useMemo<FilterOption[]>(() => {
    const options = Object.keys(TYPE_LABEL_KEYS).map((value) => ({
      value,
      label: t(TYPE_LABEL_KEYS[value]),
      count: investors.filter((inv) => inv.type === value).length,
    }));
    const eligible = total >= SECONDARY_MIN_ROWS && splitsRows(options, total);
    return eligible || f.types.length > 0 ? options : [];
  }, [investors, total, f.types.length, t]);

  // One menu for two dimensions. Values carry a prefix so a sector and a
  // country can never collide; filtering still treats them as two filters.
  const sectorRegionOptions = useMemo<FilterOption[]>(() => {
    const sectorCounts: Record<string, number> = {};
    const regionCounts: Record<string, number> = {};
    for (const inv of investors) {
      for (const s of Array.from(new Set(inv.industries))) sectorCounts[s] = (sectorCounts[s] ?? 0) + 1;
      for (const g of Array.from(new Set(inv.geography))) regionCounts[g] = (regionCounts[g] ?? 0) + 1;
    }
    for (const s of f.sectors) sectorCounts[s] = sectorCounts[s] ?? 0;
    for (const g of f.regions) regionCounts[g] = regionCounts[g] ?? 0;
    const sectors = Object.keys(sectorCounts)
      .map((s) => ({ value: `s:${s}`, label: s, count: sectorCounts[s] }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
    const regions = Object.keys(regionCounts)
      .map((g) => ({ value: `g:${g}`, label: countryLabel(t, g), count: regionCounts[g] }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
    const options = [...sectors, ...regions];
    const eligible = total >= SECONDARY_MIN_ROWS && splitsRows(options, total);
    return eligible || f.sectors.length + f.regions.length > 0 ? options : [];
  }, [investors, total, f.sectors, f.regions, locale, t]);

  const sectorRegionValue = useMemo(
    () => [...f.sectors.map((s) => `s:${s}`), ...f.regions.map((g) => `g:${g}`)],
    [f.sectors, f.regions],
  );

  const leadCount = useMemo(() => investors.filter((inv) => inv.lead_rounds).length, [investors]);
  const verifiedCount = useMemo(() => investors.filter((inv) => !!inv.verified_at).length, [investors]);
  const showLead = f.lead || (leadCount > 0 && leadCount < total);
  // Documents on file stays hidden until any row has documents on file.
  const showVerified = f.verified || (verifiedCount > 0 && verifiedCount < total);

  const sortOptions = useMemo<SortOption<SortKey>[]>(
    () => [
      ...(myRaise ? [{ value: "fit" as const, label: t("investors.sortFit") }] : []),
      { value: "recent", label: t("investors.sortRecent") },
      { value: "check_desc", label: t("investors.sortLargest") },
    ],
    [myRaise, t],
  );

  const activeCount =
    f.stages.length +
    (f.check ? 1 : 0) +
    (f.lead ? 1 : 0) +
    (f.verified ? 1 : 0) +
    f.types.length +
    f.sectors.length +
    f.regions.length;

  const results = useMemo(() => {
    const q = f.query.trim().toLowerCase();
    const band = CHECK_BANDS.find((b) => b.value === f.check) ?? null;
    const list = investors.filter((inv) => {
      if (q) {
        const haystack = [
          inv.full_name,
          inv.firm,
          inv.bio,
          ...inv.industries,
          ...inv.geography,
          ...inv.geography.map((g) => countryLabel(t, g)),
        ];
        if (!haystack.some((v) => (v ?? "").toLowerCase().includes(q))) return false;
      }
      if (f.stages.length > 0 && !f.stages.some((s) => inv.stages.includes(s))) return false;
      if (band && !inBand(inv, band)) return false;
      if (f.lead && !inv.lead_rounds) return false;
      // Documents actually filed (admin-granted, migration 049), never the plan tier.
      if (f.verified && !inv.verified_at) return false;
      if (f.types.length > 0 && !f.types.includes(inv.type)) return false;
      // Any chosen sector, and any chosen region: the menu is shared, the filters are not.
      if (f.sectors.length > 0 && !f.sectors.some((s) => inv.industries.includes(s))) return false;
      if (f.regions.length > 0 && !f.regions.some((g) => inv.geography.includes(g))) return false;
      return true;
    });
    if (sortKey === "check_desc") list.sort((a, b) => largestCheck(b) - largestCheck(a));
    else if (sortKey === "fit") list.sort((a, b) => Number(fits(b)) - Number(fits(a)));
    return list;
  }, [investors, f, sortKey, fits, t]);

  const shown = results.slice(0, page * PAGE_SIZE);
  const remaining = results.length - shown.length;

  const clearFilters = useCallback(() => setF((p) => ({ ...p, ...NO_FILTERS })), []);
  const clearAll = useCallback(() => setF((p) => ({ ...p, ...NO_FILTERS, query: "" })), []);

  // Names the condition in words: "No investors match Seed and $1M+."
  const noMatchTitle = useMemo(() => {
    const terms: string[] = [];
    const query = f.query.trim();
    if (query) terms.push(tf("investors.ledger.queryTerm", "“{query}”", { query }));
    for (const s of f.stages) terms.push(STAGE_LABELS[s] ?? s);
    const band = CHECK_BANDS.find((b) => b.value === f.check);
    if (band) terms.push(band.label);
    if (f.lead) terms.push(t("investors.leadsRounds"));
    if (f.verified) terms.push(t("investors.verifiedOnly"));
    for (const ty of f.types) terms.push(t(TYPE_LABEL_KEYS[ty]));
    for (const s of f.sectors) terms.push(s);
    for (const g of f.regions) terms.push(countryLabel(t, g));
    if (terms.length === 0 || terms.length > 3) return t("investors.noMatch");
    return tf("investors.ledger.noMatch", "No investors match {filters}.", { filters: formatList(terms, locale) });
  }, [f, locale, t, tf]);

  const narrowed = activeCount > 0 || f.query.trim().length > 0;
  const countText =
    loading || loadError || total === 0
      ? null
      : narrowed && results.length > 0 && results.length < total
        ? tfCount("investors.ledger.countOf", "{shown} of {count} investor", "{shown} of {count} investors", total, { shown: results.length })
        : tfCount("investors.ledger.count", "{count} investor", "{count} investors", total);

  // Filtering rewrites the list with no navigation, so a screen reader is
  // told the outcome. Skips the first render, where a count read over the
  // page title is noise rather than news.
  const announcement =
    results.length === 0
      ? noMatchTitle
      : results.length === 1
        ? t("investors.foundCountOne")
        : t("investors.foundCount", { count: results.length });
  const hasAnnounced = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!hasAnnounced.current) {
      hasAnnounced.current = true;
      return;
    }
    announce(announcement);
  }, [announcement, loading]);

  const showBar = total > 1 || activeCount > 0 || f.query.length > 0;
  const upTo = (amount: string) => tf("investors.ledger.upTo", "Up to {amount}", { amount });

  return (
    <main className="w-full px-4 pb-16 sm:px-6 md:px-8" style={FRAME}>
      <PageHeader title={t("nav.investors")} count={countText} />

      {loading ? (
        <>
          <p role="status" className="sr-only">{t("investors.loadingInvestors")}</p>
          <DirectorySkeleton />
        </>
      ) : loadError ? (
        <EmptyState
          title={tf("investors.ledger.loadError", "Investors could not be loaded.")}
          action={
            <button type="button" className="cr-btn cr-btn--text" style={TEXT_ACTION} onClick={() => void fetchInvestors(false)}>
              {t("errorPage.retry")}
            </button>
          }
        />
      ) : total === 0 ? (
        <EmptyState title={tf("investors.ledger.nonePublic", "No investors have made their profile visible yet.")} />
      ) : (
        <>
          {showBar && (
            <FilterBar
              aria-label={tf("investors.ledger.filterLabel", "Filter investors")}
              activeCount={activeCount}
              onClear={clearFilters}
              sticky={total > STICKY_AFTER}
              sheetDoneLabel={results.length > 0 ? t("filters.applyCount", { count: results.length }) : t("common.done")}
              search={
                <FilterSearch
                  value={f.query}
                  onChange={(next) => setF((p) => ({ ...p, query: next }))}
                  label={t("common.search")}
                  placeholder={tf("investors.ledger.searchPlaceholder", "Search name, firm or sector")}
                  inputRef={searchRef}
                  name="q"
                />
              }
              sort={
                total > 1 ? (
                  <SortSelect<SortKey>
                    options={sortOptions}
                    value={sortKey}
                    onChange={(next) => setF((p) => ({ ...p, sort: next }))}
                  />
                ) : undefined
              }
            >
              <FilterMenu
                label={t("filters.stage")}
                options={stageOptions}
                value={f.stages}
                onChange={(next) => setF((p) => ({ ...p, stages: next }))}
              />
              <FilterMenu<CheckBand>
                label={t("investors.checkSize")}
                multiple={false}
                options={checkOptions}
                value={f.check}
                onChange={(next) => setF((p) => ({ ...p, check: next }))}
              />
              {showLead && (
                <FilterToggle
                  label={t("investors.leadsRounds")}
                  pressed={f.lead}
                  onChange={(next) => setF((p) => ({ ...p, lead: next }))}
                />
              )}
              {showVerified && (
                <FilterToggle
                  label={t("investors.verifiedOnly")}
                  pressed={f.verified}
                  onChange={(next) => setF((p) => ({ ...p, verified: next }))}
                />
              )}
              <FilterMenu
                label={tf("investors.ledger.type", "Type")}
                options={typeOptions}
                value={f.types}
                onChange={(next) => setF((p) => ({ ...p, types: next }))}
              />
              <FilterMenu
                label={tf("investors.ledger.sectorRegion", "Sector & region")}
                options={sectorRegionOptions}
                value={sectorRegionValue}
                onChange={(next) =>
                  setF((p) => ({
                    ...p,
                    sectors: next.filter((v) => v.startsWith("s:")).map((v) => v.slice(2)),
                    regions: next.filter((v) => v.startsWith("g:")).map((v) => v.slice(2)),
                  }))
                }
              />
            </FilterBar>
          )}

          {results.length === 0 ? (
            <EmptyState
              title={noMatchTitle}
              action={
                <button type="button" className="cr-btn cr-btn--text" style={TEXT_ACTION} onClick={activeCount > 0 ? clearAll : () => setF((p) => ({ ...p, query: "" }))}>
                  {activeCount > 0 ? t("investors.clearFilters") : tf("common.ledger.clearSearch", "Clear search")}
                </button>
              }
            />
          ) : (
            <>
              <Ledger
                columns={COLUMNS}
                aria-label={t("nav.investors")}
                head={
                  <LedgerHead>
                    <LedgerCell>{tf("investors.ledger.colInvestor", "Investor")}</LedgerCell>
                    <LedgerCell>{tf("investors.ledger.colMandate", "Mandate")}</LedgerCell>
                    <LedgerCell figure>{t("investors.checkSize")}</LedgerCell>
                  </LedgerHead>
                }
              >
                {shown.map((inv) => {
                  const name = inv.full_name || t("investors.anonymousInvestor");
                  const typeKey = hasOwn(TYPE_LABEL_KEYS, inv.type) ? TYPE_LABEL_KEYS[inv.type] : null;
                  const meta = [
                    inv.firm,
                    typeKey ? t(typeKey) : null,
                    inv.lead_rounds ? t("investors.leadsRounds") : null,
                    inv.geography.length > 0 ? inv.geography.map((g) => countryLabel(t, g)).join(", ") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const mandate = [
                    inv.stages.map((s) => STAGE_LABELS[s]).filter(Boolean).join(", "),
                    inv.industries.join(", "),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const check = formatCheckRange(inv, upTo);
                  return (
                    <LedgerRow key={inv.id} href={`/investors/${inv.slug}`} label={name}>
                      <LedgerCell primary>
                        <span style={NAME_LINE}>
                          <span className="cr-row-title" style={NAME}>{name}</span>
                          {inv.is_demo && <span className="cr-chip" style={{ flex: "none" }}>{t("demo.badge")}</span>}
                        </span>
                        {meta && <span className="cr-row-sub">{meta}</span>}
                        {inv.bio && <span className="cr-row-sub">{inv.bio}</span>}
                      </LedgerCell>
                      <LedgerCell>
                        <span className="cr-row-sub" style={MANDATE}>{mandate}</span>
                      </LedgerCell>
                      <LedgerCell figure>
                        {check ?? <span className="cr-absent">{tf("investors.ledger.notStated", "Not stated")}</span>}
                        <span style={FIT_SLOT}>{fits(inv) ? t("investors.fitsYourRaise") : null}</span>
                      </LedgerCell>
                    </LedgerRow>
                  );
                })}
              </Ledger>

              {remaining > 0 && (
                <div className="cr-ledger-foot">
                  <button type="button" className="cr-btn cr-btn--text" style={TEXT_ACTION} onClick={() => setPage((p) => p + 1)}>
                    {tfCount(
                      "investors.ledger.showMore",
                      "Show {count} more investor",
                      "Show {count} more investors",
                      Math.min(PAGE_SIZE, remaining),
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
