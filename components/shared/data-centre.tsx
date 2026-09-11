"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";
import { STAGE_LABELS } from "@/lib/utils";
import { RefreshCw, AlertTriangle, Download, Building2 } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { LiveClock } from "@/components/ui/LiveClock";
import { LedgerLoader } from "@/components/ui/LedgerLoader";
import { EmptyState } from "@/components/ui/EmptyState";
import { safeFormatCurrency } from "@/lib/format";
import { safeFormatTotal } from "@/lib/validators";
import { LineChart } from "@/components/charts/line-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarChart } from "@/components/charts/bar-chart";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TopStartup {
  name: string;
  slug: string;
  industry: string;
  stage: string;
  mrr: number | null;
  ai_score: number | null;
  funding_target: number | null;
  created_at: string;
}

interface PlatformData {
  startupCount: number;
  investorCount: number;
  totalRaised: number;
  dealsCount: number;
  byDealStage: Record<string, number>;
  activeDeals: number;
  closeRate: number | null;
  closedCurrencies: string[];
  byIndustry: Record<string, number>;
  byStage: Record<string, number>;
  topStartups: TopStartup[];
  recentStartups: TopStartup[];
  monthly?: Array<{ month: string; listings: number; closed: number; sought: number }>;
  report?: { medianByStage: Record<string, number>; newThisMonth: number };
  lastUpdated: string;
}

// ── The rhythm ─────────────────────────────────────────────────────────────────

// One vertical rhythm for the whole surface, taken from the 4/8/12/16/24/32/
// 48/64/96 scale. The page used to mix 6/8/12/16/22/24/25/56, which reads as
// arbitrary even when nothing else is wrong. Four steps, each visibly larger
// than the one below it:
//   SECTION  64 (48 on phones)  between chapters
//   BLOCK    32                 between blocks inside a chapter
//   ROW      16                 inside a block
//   LABEL     8                 from a label to the figure it names
const SECTION_GAP = "clamp(48px, 6vw, 64px)";
const BLOCK_GAP = "32px";
const ROW_GAP = "16px";
const LABEL_GAP = "8px";

// ── The voices ─────────────────────────────────────────────────────────────────

// Exactly one figure on this page is allowed to be the loudest, and it is the
// total raised. Every other number on the surface -- supporting totals, funnel
// counts, medians -- speaks at FIG_2, a full step down, so the eye is told
// where to land instead of being shouted at from five directions.
const FIG_LEAD = "clamp(40px, 5vw + 16px, 64px)";
const FIG_2 = "clamp(20px, 1.4vw + 12px, 28px)";

const capsLabel: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px",
  textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)",
};

const monoFigure: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
  fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
  color: "var(--cr-ink)", lineHeight: 1,
};

// Tables: a header row in Label type over a heavy rule, rows split by
// hairlines. Cells get 12px of air rather than the old 6px -- the fix for a
// dense table is room, not fewer columns.
const cellTh: React.CSSProperties = {
  ...capsLabel, textAlign: "left", padding: "0 12px 12px",
  borderBottom: "1px solid var(--cr-rule-dark)",
};
const cellThNum: React.CSSProperties = { ...cellTh, textAlign: "right" };

// Ledger alignment: text columns sit left, figures sit right, the way any
// statistical yearbook sets a table.
const cellTd: React.CSSProperties = {
  padding: "12px", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px",
  fontVariantNumeric: "tabular-nums", color: "var(--cr-ink-2)",
  borderTop: "1px solid var(--cr-rule)",
};
const cellTdNum: React.CSSProperties = { ...cellTd, textAlign: "right" };

/** Axis money: "$100M", never "100000000". Tiers to $T, as the totals in the
 *  table do -- an axis stopping at "$2000B" would not read as the same ladder. */
function compactMoney(n: number): string {
  if (n >= 1_000_000_000_000) return `$${Math.round(n / 1_000_000_000_000)}T`;
  if (n >= 1_000_000_000) return `$${Math.round(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

/** Round targets read at a glance: "$1.2M", "$450k". */
function medianMoney(n: number): string {
  return "$" + (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : Math.round(n / 1000) + "k");
}

/** "2026-08" → "Aug". The year only where it changes, so twelve labels stay short. */
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const name = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en", { month: "short", timeZone: "UTC" });
  return m === "01" ? `${name} ${y.slice(2)}` : name;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * The whole public dashboard as one CSV: headline counts, the deal funnel,
 * and both breakdowns, each row tagged by section so a spreadsheet can pivot
 * it. What is on screen is what lands in the file -- no second query, no
 * chance of the export disagreeing with the page.
 */
function exportPlatformCsv(d: PlatformData) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows: Array<[string, string, string | number]> = [
    ["headline", "Active startups", d.startupCount],
    ["headline", "Verified investors", d.investorCount],
    ["headline", "Total raised", d.totalRaised],
    ["headline", "Deals closed", d.dealsCount],
    ["headline", "Active deals", d.activeDeals],
    // lib/platform-data already rounds this to whole percent; multiplying by
    // 100 again exported a 42% close rate as "4200%".
    ["headline", "Close rate", d.closeRate == null ? "" : `${d.closeRate}%`],
    ...Object.entries(d.byDealStage).map(([k, v]) => ["deal_stage", k, v] as [string, string, number]),
    ...Object.entries(d.byIndustry).map(([k, v]) => ["industry", k, v] as [string, string, number]),
    ...Object.entries(d.byStage).map(([k, v]) => ["startup_stage", k, v] as [string, string, number]),
    // The medians land in the export too, so the table on screen can be
    // checked against the file rather than retyped out of it.
    ...Object.entries(d.report?.medianByStage ?? {}).map(([k, v]) => ["median_target", k, v] as [string, string, number]),
    // The time series lands in the export too, so the shape on the chart can
    // be checked against the numbers rather than taken on trust.
    ...(d.monthly ?? []).flatMap(m => ([
      ["monthly_listings", m.month, m.listings],
      ["monthly_closed", m.month, m.closed],
      ["monthly_sought", m.month, m.sought],
    ] as Array<[string, string, number]>)),
  ];
  const csv = [["section", "label", "value"], ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `capitalreach-platform-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Order matters: this is the funnel, left to right, ending in the two terminal
// outcomes. The three in-flight stages are one ink ramp that darkens toward
// the close -- they used to be three different hues, which put four accent
// colours in a single eyeful and made the sequence look like five unrelated
// categories. Colour is now spent only where it means something: green on
// capital that moved, red on the round that died.
const DEAL_STAGES = [
  { key: "intro",         color: "var(--cr-ink-4)" },
  { key: "due_diligence", color: "var(--cr-ink-3)" },
  { key: "term_sheet",    color: "var(--cr-ink-2)" },
  { key: "closed",        color: "var(--cr-up)" },
  { key: "passed",        color: "var(--cr-down)" },
] as const;

// The canonical map lives in lib/utils. A local copy here had the wrong
// keys (pre_seed / series_b vs the DB's pre-seed / series_b_plus), so the
// stage breakdown and recent listings showed raw enum values for half the
// stages.

// Goes through the shared safety net, which renders an absence dash for
// implausible values rather than a wrong number.
function fmtRaising(n: number | null | undefined) { return safeFormatCurrency(n); }

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Animated count-up ─────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const [done, setDone] = useState(false);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) { setValue(0); setDone(true); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(ease * target));
      if (progress < 1) { raf.current = requestAnimationFrame(tick); }
      else { setDone(true); }
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);

  return { value, done };
}

// ── Stat ──────────────────────────────────────────────────────────────────────

// The boxed tile is gone: an annual report rules a figure, it does not
// frame it. Each stat is an overline hairline, a small-caps label and a
// confident mono figure sitting directly on the paper. `lead` promotes the
// one commanding figure on the page, under a heavier ink rule.
function StatCard({ label, value, prefix = "", lead = false }: {
  label: string;
  value: number;
  prefix?: string;
  lead?: boolean;
}) {
  const { value: displayed, done } = useCountUp(value);
  return (
    <div style={{
      borderTop: lead ? "2px solid var(--cr-ink)" : "1px solid var(--cr-rule-dark)",
      paddingTop: lead ? ROW_GAP : "12px",
    }}>
      <p style={{ ...capsLabel, ...(lead ? { color: "var(--cr-ink-3)" } : null), marginBottom: LABEL_GAP }}>{label}</p>
      <p
        className={done ? "count-glow-done" : ""}
        style={{ ...monoFigure, fontSize: lead ? FIG_LEAD : FIG_2, overflowWrap: "anywhere" }}
      >
        {prefix}{displayed.toLocaleString()}
      </p>
    </div>
  );
}

// A label over its figure, the same pair the stats use, for the places that
// are not a counted total.
function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ ...capsLabel, marginBottom: LABEL_GAP }}>{label}</p>
      <p style={{ ...monoFigure, fontSize: FIG_2 }}>{children}</p>
    </div>
  );
}

// ── Score pill ────────────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number | null }) {
  if (!score) return <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>—</span>;
  // Quality reads in copper and ink, never green/red -- those mean money direction.
  const color = score >= 80 ? "var(--cr-copper)" : score >= 60 ? "var(--cr-ink-2)" : score >= 40 ? "var(--cr-ink-3)" : "var(--cr-ink-4)";
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "11px",
      color, background: `color-mix(in srgb, ${color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      borderRadius: "3px", padding: "2px 8px",
    }}>
      {score}
    </span>
  );
}

// ── Tab strip ─────────────────────────────────────────────────────────────────

interface TabDef<K extends string> { key: K; label: string }

/**
 * The page's one disclosure device.
 *
 * Eight chapters used to arrive at once, each with its own chart or ledger,
 * so nothing on the surface was quiet enough to be read first. The deeper
 * material now sits behind these strips: every figure, chart and table that
 * was on the page is still on the page and still one click away, but only one
 * of them speaks at a time.
 *
 * A ruled strip rather than a pill row: the underline is the same hairline
 * language the rest of the surface is built from, and it needs no filled box.
 */
function TabStrip<K extends string>({ tabs, active, onSelect, idBase, label }: {
  tabs: ReadonlyArray<TabDef<K>>;
  active: K;
  onSelect: (key: K) => void;
  idBase: string;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      style={{
        display: "flex", flexWrap: "wrap", gap: "0 24px",
        borderBottom: "1px solid var(--cr-rule-dark)", marginBottom: BLOCK_GAP,
      }}
    >
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tab.key}`}
            aria-selected={on}
            aria-controls={`${idBase}-panel-${tab.key}`}
            onClick={() => onSelect(tab.key)}
            style={{
              ...capsLabel,
              fontSize: "11px",
              display: "inline-flex", alignItems: "center",
              // 40px keeps the target thumb-sized on a phone without adding
              // padding that would break the rhythm.
              minHeight: "40px", padding: 0,
              background: "none", cursor: "pointer",
              color: on ? "var(--cr-ink)" : "var(--cr-ink-4)",
              border: "none",
              // The active mark sits ON the strip's own hairline, not under it.
              borderBottom: on ? "2px solid var(--cr-copper)" : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// English wording for the withheld-names line, carried in code only until the
// dictionaries have the key (see tf below).
const NAMES_WITHHELD_EN = "Company names are part of a paid investor plan. Every figure on this page still counts them all.";

export function DataCentre({ initialData }: { initialData?: PlatformData | null } = {}) {
  const { t } = useTranslation();
  // t() echoes the key back when no dictionary has it. The handful of keys
  // this layout adds are new, so they carry their English wording until the
  // dictionaries catch up -- a raw "data.viewActivity" must never reach a
  // screen.
  const tf = useCallback((key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  }, [t]);

  // Server-rendered aggregate (lib/platform-data) means the first paint is
  // the finished dashboard; the fetch below only runs for refresh/retry.
  const [data, setData] = useState<PlatformData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(false);

  // Three disclosures, one device. Growth opens on the activity chart (the
  // page's single primary chart); the numbers behind it are the third tab, so
  // every chart still has a table for anyone the colours fail.
  const [growthView, setGrowthView] = useState<"activity" | "capital" | "numbers">("activity");
  const [breakdown, setBreakdown] = useState<"deals" | "industry" | "stage" | "medians">("deals");
  const [ledger, setLedger] = useState<"scores" | "recent">("scores");

  const growthId = useId();
  const breakdownId = useId();
  const ledgerId = useId();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/platform-data");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      if (json.degraded) throw new Error("Degraded");
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialData) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  // The numbers keep themselves current: a quiet refresh every 60s while the
  // tab is visible (no spinner -- setLoading stays untouched on refreshes so
  // the page never flickers), and one immediately when the tab regains focus.
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/platform-data");
        if (!res.ok) return;
        const json = await res.json();
        if (!json.degraded) setData(json);
      } catch { /* keep showing the last good numbers */ }
    };
    const id = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const monthly = data?.monthly ?? [];
  const industryEntries = data
    ? Object.entries(data.byIndustry).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];
  const stageEntries = data
    ? Object.entries(data.byStage).sort((a, b) => b[1] - a[1])
    : [];
  const medianEntries = data
    ? Object.entries(data.report?.medianByStage ?? {}).sort((a, b) => (data.byStage[b[0]] ?? 0) - (data.byStage[a[0]] ?? 0))
    : [];

  // The strip only offers a tab it can fill, and the selected tab falls back
  // to the first available one -- a platform with no deals must not open on
  // an empty funnel.
  const breakdownTabs = [
    ...(data?.byDealStage ? [{ key: "deals" as const, label: t("data.dealFlow") }] : []),
    { key: "industry" as const, label: tf("data.tabIndustry", "Industry") },
    { key: "stage" as const, label: t("listings.stage") },
    ...(medianEntries.length > 0 ? [{ key: "medians" as const, label: tf("data.tabMedians", "Medians") }] : []),
  ];
  const activeBreakdown = breakdownTabs.some(b => b.key === breakdown)
    ? breakdown
    : (breakdownTabs[0]?.key ?? "industry");

  const growthTabs = [
    { key: "activity" as const, label: tf("data.viewActivity", "Activity") },
    { key: "capital" as const, label: t("data.capitalSought") },
    { key: "numbers" as const, label: tf("data.viewNumbers", "Numbers") },
  ];

  const ledgerTabs = [
    { key: "scores" as const, label: t("data.topAiScores") },
    { key: "recent" as const, label: t("data.recentListings") },
  ];

  // The two ledgers are the only NAMED thing on this page, and both the server
  // page and /api/platform-data blank them for a viewer who may not read
  // listings. The recent ledger is the newest five of whatever exists, so an
  // aggregate that counts companies while that list is empty means the names
  // were withheld -- and "none yet" would describe an empty platform that is
  // demonstrably not empty.
  const namesWithheld = !!data && data.startupCount > 0 && data.recentStartups.length === 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--cr-paper)", position: "relative" }}>

      {/* Header strip */}
      <div style={{ position: "relative", background: "var(--cr-band-bg)", borderBottom: "1px solid var(--cr-copper-br)" }}>
        {/* Side gutters relax on small screens: a fixed 32px left 311px of
            content at 375px, which forced every grid into a squeeze. */}
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "64px clamp(24px, 5vw, 32px) 48px" }}>
          {/* The masthead opens like every chapter below it: the ruled label,
              not an icon -- the pictogram repeated what the words say. */}
          <div className="ruled-label" style={{ marginBottom: ROW_GAP, color: "var(--cr-band-ink-dim)" }}>{t("data.eyebrow")}</div>
          {/* The title steps down from 52px: the loudest thing on this page
              is the total raised, and a masthead competing with it left the
              reader with two headlines and no hierarchy. */}
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(30px, 4.5vw, 44px)", color: "var(--cr-band-ink)", letterSpacing: "-0.03em", marginBottom: ROW_GAP }}>
            {t("data.title")}
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-band-ink-dim)", maxWidth: "480px", lineHeight: 1.6 }}>
            {t("data.subtitle")}
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-band-ink-dim)", marginTop: LABEL_GAP }}>
            {t("data.sampleNote")}
          </p>
          {/* The meta row set as a colophon: one hairline above, then the
              live mark, the clock, the freshness stamp and the two quiet
              utilities on a single line. The live dot is copper -- active
              state -- because green means money direction, nothing else. */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px 24px", marginTop: BLOCK_GAP, paddingTop: ROW_GAP, borderTop: "1px solid color-mix(in srgb, var(--cr-band-ink) 18%, transparent)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: LABEL_GAP }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: "999px", background: "var(--cr-copper)", flexShrink: 0 }} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-band-ink-dim)" }}>{t("data.live")}</span>
            </div>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-band-ink-dim)" }}>
              <LiveClock />
            </span>
            {data && (
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-band-ink-dim)" }}>
                {t("data.updated", { time: timeAgo(data.lastUpdated) })}
              </span>
            )}
            {data && (
              <button
                onClick={() => exportPlatformCsv(data)}
                style={{ display: "flex", alignItems: "center", gap: LABEL_GAP, background: "none", border: "none", cursor: "pointer", color: "var(--cr-band-ink-dim)", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", padding: 0 }}
              >
                <Download style={{ width: 12, height: 12 }} />
                {t("data.exportCsv")}
              </button>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: LABEL_GAP, background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", opacity: loading ? 0.5 : 1, padding: 0 }}
            >
              <RefreshCw style={{ width: 12, height: 12, animation: loading ? "spin 1s linear infinite" : "none" }} />
              {t("data.refresh")}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px clamp(24px, 5vw, 32px) 96px" }}>

        {/* Loading: the ledger being written, not a soup of gray bars. */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "96px 0" }}>
            <LedgerLoader label={t("data.loading")} />
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "96px 24px", textAlign: "center" }}>
            <AlertTriangle style={{ width: 32, height: 32, color: "var(--cr-copper)", marginBottom: ROW_GAP }} />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: LABEL_GAP }}>{t("data.errorTitle")}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginBottom: "24px" }}>{t("data.errorSub")}</p>
            <button
              onClick={fetchData}
              style={{ display: "flex", alignItems: "center", gap: LABEL_GAP, background: "var(--cr-copper)", color: "var(--cr-band-ink)", border: "none", borderRadius: "999px", padding: "12px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
            >
              <RefreshCw style={{ width: 12, height: 12 }} /> {t("data.retry")}
            </button>
          </div>
        )}

        {/* Empty platform state: the shared drawer-tag block, one quiet way out. */}
        {!loading && !error && data && data.startupCount === 0 && (
          <div style={{ padding: `${BLOCK_GAP} 0` }}>
            <EmptyState
              Icon={Building2}
              title={t("data.noData")}
              body={t("data.beFirstFounders")}
              action={
                <Link href="/auth/signup?role=startup" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-copper)", textDecoration: "none" }}>
                  {t("data.listYourStartup")} →
                </Link>
              }
            />
          </div>
        )}

        {/* Data loaded */}
        {!loading && !error && data && data.startupCount > 0 && (
          <>
            {/* ── The platform in four numbers ──────────────────────────────
                The page opens on figures and nothing else: no chart, no
                table, no second heading competing for the same glance. One
                commanding total under a heavy ink rule, three supporting
                totals a full size down beneath it. */}
            <section style={{ marginBottom: SECTION_GAP }}>
              <div className="ruled-label" style={{ marginBottom: BLOCK_GAP }}>{t("data.eyebrow")}</div>
              <StatCard lead label={t("data.raised")} value={data.totalRaised} prefix="$" />
              {/* The three supporting totals as one hairline-divided strip:
                  vertical rules between the figures, not a grid of tiles.
                  The crop trick (overflow hidden + a negative margin equal to
                  the cell's own inset) hides the first divider in every wrap
                  state, so the strip is flush left on desktop and each stat
                  stacks clean at phone widths. */}
              <div style={{ overflow: "hidden", marginTop: BLOCK_GAP }}>
                <div style={{ display: "flex", flexWrap: "wrap", rowGap: "24px", marginLeft: "-24px" }}>
                  <div style={{ flex: "1 1 170px", minWidth: 0, borderLeft: "1px solid var(--cr-rule)", padding: "0 24px" }}>
                    <StatCard label={t("data.startups")} value={data.startupCount} />
                  </div>
                  <div style={{ flex: "1 1 170px", minWidth: 0, borderLeft: "1px solid var(--cr-rule)", padding: "0 24px" }}>
                    <StatCard label={t("data.investors")} value={data.investorCount} />
                  </div>
                  <div style={{ flex: "1 1 170px", minWidth: 0, borderLeft: "1px solid var(--cr-rule)", padding: "0 24px" }}>
                    <StatCard label={t("data.deals")} value={data.dealsCount} />
                  </div>
                </div>
              </div>
            </section>

            {/* ── The one primary chart ─────────────────────────────────────
                Totals say how big the platform is and nothing about whether
                it is growing, so growth is the single chart the page shows on
                arrival. Twelve months, empty months included: dropping them
                draws a straight line across the gap, which reads as steady
                activity and is the opposite of what happened. Capital sits on
                its own tab rather than its own frame -- two units in one
                eyeful was two charts where the reader needed one -- and the
                numbers behind both are the third tab. */}
            {monthly.length > 0 && (
              <section style={{ marginBottom: SECTION_GAP }}>
                <div className="ruled-label" style={{ marginBottom: ROW_GAP }}>{t("data.overTime")}</div>
                <TabStrip
                  tabs={growthTabs}
                  active={growthView}
                  onSelect={setGrowthView}
                  idBase={growthId}
                  label={t("data.overTime")}
                />
                <div
                  role="tabpanel"
                  id={`${growthId}-panel-${growthView}`}
                  aria-labelledby={`${growthId}-tab-${growthView}`}
                >
                  {growthView === "numbers" ? (
                    /* Every chart has a table behind it: some of these fills
                       sit below 3:1 against paper, and a reader who cannot
                       separate them still needs the numbers. */
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "480px" }}>
                        <thead>
                          <tr>
                            {/* Ledger alignment: the month reads left, every
                                figure right, so magnitudes line up down each
                                column the way a yearbook sets them. */}
                            {[t("data.month"), t("data.newListings"), t("data.dealsClosed"), t("data.capitalSought")].map((h, i) => (
                              <th key={h} style={i === 0 ? cellTh : cellThNum}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {monthly.map(m => (
                            <tr key={m.month}>
                              <td style={cellTd}>{m.month}</td>
                              <td style={cellTdNum}>{m.listings}</td>
                              <td style={cellTdNum}>{m.closed}</td>
                              {/* A total, not one listing's figure: the
                                  per-listing bound prints a legitimate month
                                  as an absence while the chart plots it. */}
                              <td style={cellTdNum}>{safeFormatTotal(m.sought)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : growthView === "capital" ? (
                    <>
                      {/* Capital is a different unit, so it gets its own
                          frame. Two scales on one axis can be made to cross
                          wherever you like, which is the commonest way a
                          chart lies. */}
                      <p style={{ ...capsLabel, letterSpacing: "0.1em", margin: `0 0 ${ROW_GAP}` }}>
                        {t("data.capitalSought")}
                        <span className="mono" style={{ textTransform: "none", fontWeight: 500, letterSpacing: 0, marginLeft: LABEL_GAP, color: "var(--cr-ink-4)" }}>$/mo</span>
                      </p>
                      <LineChart
                        height={200}
                        labels={monthly.map(m => monthLabel(m.month))}
                        formatTick={(n) => (n === 0 ? "0" : compactMoney(n))}
                        series={[{ key: "sought", label: t("data.capitalSought"), values: monthly.map(m => m.sought), format: safeFormatTotal }]}
                      />
                    </>
                  ) : (
                    <>
                      {/* The caption names both series in the frame; the mono
                          "/mo" says what one point on the line IS -- a count
                          for that month, not a running total. */}
                      <p style={{ ...capsLabel, letterSpacing: "0.1em", margin: `0 0 ${ROW_GAP}` }}>
                        {t("data.newListings")} · {t("data.dealsClosed")}
                        <span className="mono" style={{ textTransform: "none", fontWeight: 500, letterSpacing: 0, marginLeft: LABEL_GAP, color: "var(--cr-ink-4)" }}>/mo</span>
                      </p>
                      <LineChart
                        height={200}
                        labels={monthly.map(m => monthLabel(m.month))}
                        series={[
                          { key: "listings", label: t("data.newListings"), values: monthly.map(m => m.listings) },
                          { key: "closed", label: t("data.dealsClosed"), values: monthly.map(m => m.closed) },
                        ]}
                      />
                    </>
                  )}
                </div>
              </section>
            )}

            {/* ── The breakdowns ────────────────────────────────────────────
                Four cuts of the same platform, one visible at a time. The
                funnel, the industry ring, the stage bars and the medians
                table all used to land at once, each with its own heading and
                its own accent, which is what made the page shout. Nothing has
                been dropped: every one of them is a single click away, and
                the medians tab now lists every stage rather than the top
                three the old band had room for. */}
            <section style={{ marginBottom: SECTION_GAP }}>
              <div className="ruled-label" style={{ marginBottom: ROW_GAP }}>{tf("data.breakdowns", "Breakdowns")}</div>
              <TabStrip
                tabs={breakdownTabs}
                active={activeBreakdown}
                onSelect={setBreakdown}
                idBase={breakdownId}
                label={tf("data.breakdowns", "Breakdowns")}
              />
              <div
                role="tabpanel"
                id={`${breakdownId}-panel-${activeBreakdown}`}
                aria-labelledby={`${breakdownId}-tab-${activeBreakdown}`}
              >
                {/* Deal flow. Aggregate counts only -- the API deliberately
                    sends no startup, investor or per-deal amount, because
                    deals are private between their two participants. */}
                {activeBreakdown === "deals" && data.byDealStage && (
                  <>
                    {/* The two headline figures answer "how many deals, how
                        many close" before the funnel is read. Close rate is
                        set in ink, not green: green on this surface means
                        capital moved, and a ratio is not a direction. */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: `${ROW_GAP} 32px`, marginBottom: BLOCK_GAP }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>
                        {t("data.liveDeals")}{" "}
                        <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontSize: "13px", color: "var(--cr-ink)" }}>{data.activeDeals}</strong>
                      </span>
                      {data.closeRate != null && (
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>
                          {t("data.closeRate")}{" "}
                          <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontSize: "13px", color: "var(--cr-ink)" }}>{data.closeRate}%</strong>
                        </span>
                      )}
                    </div>

                    {/* The funnel as an open strip, not a boxed grid: five
                        columns split by vertical hairlines, each opened by
                        its own overline rule, sitting directly on the paper.
                        The crop trick handles every wrap state -- five across
                        on desktop, a stacked funnel at phone widths --
                        without a media query. */}
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", rowGap: BLOCK_GAP, marginLeft: "-24px" }}>
                        {DEAL_STAGES.map(({ key, color }, idx) => {
                          const n = data.byDealStage[key] ?? 0;
                          const max = Math.max(...Object.values(data.byDealStage), 1);
                          return (
                            <div key={key} style={{ flex: "1 1 150px", minWidth: 0, display: "flex", flexDirection: "column", borderTop: "1px solid var(--cr-rule-dark)", borderLeft: "1px solid var(--cr-rule)", padding: "12px 24px 0" }}>
                              {/* Numbered rail: the 01-05 says these are one
                                  sequence, read left to right, ending in the
                                  two outcomes. It is the only numbered rail
                                  left on the page, so the device now means
                                  "this is ordered" and nothing else. */}
                              <p style={{ ...capsLabel, fontSize: "9px", letterSpacing: "0.1em", marginBottom: "12px" }}>
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--cr-copper)", marginRight: LABEL_GAP }}>{`0${idx + 1}`}</span>
                                {t(`data.stage_${key}`)}
                              </p>
                              {/* Same figure size as every other second-rank
                                  number on the page. The meter pins to the
                                  bottom so the five bars align even when a
                                  stage name wraps. */}
                              <p style={{ ...monoFigure, fontSize: FIG_2, marginBottom: "12px" }}>{n}</p>
                              {/* The track is capped at a fixed width: when
                                  the strip wraps, cells differ in width, and
                                  a percentage of the cell would give the same
                                  count a longer bar on a wider row. */}
                              <div style={{ height: "2px", maxWidth: "120px", background: "var(--cr-rule)", overflow: "hidden", marginTop: "auto" }}>
                                <div style={{ width: `${(n / max) * 100}%`, height: "100%", background: color }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {data.closedCurrencies?.length > 1 && (
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: ROW_GAP }}>
                        {t("data.multiCurrencyNote", { list: data.closedCurrencies.join(", ") })}
                      </p>
                    )}
                  </>
                )}

                {/* Industry: share of the whole -- the one question a ring
                    answers better than bars. The FULL breakdown, not the top
                    six: the ring has to close, and a ring with a gap in it
                    reads as a rendering bug rather than as "the rest". The
                    component folds the tail into a grey "other" itself, and
                    every slice carries its percentage so nothing rests on
                    telling two colours apart. */}
                {activeBreakdown === "industry" && (
                  industryEntries.length === 0 ? (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", padding: `${BLOCK_GAP} 0` }}>{t("data.noDataYet")}</p>
                  ) : (
                    <DonutChart
                      slices={Object.entries(data.byIndustry).map(([label, count]) => ({ key: label, label, value: count }))}
                      otherLabel={t("data.otherIndustries")}
                      hrefFor={(industry) => `/startups?industries=${encodeURIComponent(industry)}`}
                    />
                  )
                )}

                {/* Stage breakdown */}
                {activeBreakdown === "stage" && (
                  stageEntries.length === 0 ? (
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", padding: `${BLOCK_GAP} 0` }}>{t("data.noDataYet")}</p>
                  ) : (
                    <BarChart
                      bars={stageEntries.map(([label, count]) => ({
                        key: label, label: STAGE_LABELS[label] ?? label, value: count,
                      }))}
                      hrefFor={(stage) => `/startups?stages=${encodeURIComponent(stage)}`}
                    />
                  )
                )}

                {/* Medians, not means: one mega-round must not move what the
                    market calls a typical raise. This was a slab of 52px
                    copper figures competing with the page's lead total; as a
                    ruled table it holds every stage instead of three, and the
                    figures sit in ink where they belong. */}
                {activeBreakdown === "medians" && data.report && (
                  <>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "480px" }}>
                        <thead>
                          <tr>
                            <th style={cellTh}>{t("listings.stage")}</th>
                            <th style={cellThNum}>{t("report.medianTarget")}</th>
                            <th style={cellThNum}>{tf("data.listingsCount", "Listings")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {medianEntries.map(([stage, median]) => (
                            <tr key={stage}>
                              <td style={{ ...cellTd, fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)" }}>
                                {(STAGE_LABELS[stage] ?? stage).replace(/_/g, " ")}
                              </td>
                              <td style={{ ...cellTdNum, color: "var(--cr-ink)", fontWeight: 600 }}>{medianMoney(median)}</td>
                              <td style={cellTdNum}>{data.byStage[stage] ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {data.report.newThisMonth > 0 && (
                      <div style={{ marginTop: BLOCK_GAP, borderTop: "1px solid var(--cr-rule-dark)", paddingTop: "12px" }}>
                        <Figure label={t("report.newThisMonth")}>{data.report.newThisMonth}</Figure>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* ── The rounds themselves ─────────────────────────────────────
                After the aggregates, the individual listings. Two ledgers
                that used to sit side by side, each with its own heading and
                its own "view all", now share one opener and one link: the
                ranking and the newest rounds are a tap apart, and a phone
                gets one ledger at a time instead of twelve stacked rows. */}
            <section style={{ marginBottom: SECTION_GAP }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: ROW_GAP }}>
                <div className="ruled-label">{t("listings.sectionLabel")}</div>
                <Link href="/startups" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", textDecoration: "none", whiteSpace: "nowrap" }}>{t("common.viewAll")} →</Link>
              </div>
              <TabStrip
                tabs={ledgerTabs}
                active={ledger}
                onSelect={setLedger}
                idBase={ledgerId}
                label={t("listings.sectionLabel")}
              />
              <div
                role="tabpanel"
                id={`${ledgerId}-panel-${ledger}`}
                aria-labelledby={`${ledgerId}-tab-${ledger}`}
                style={{ minWidth: 0 }}
              >
                {ledger === "scores" ? (
                  <>
                    {/* One plain-language line saying what the ranking is.
                        "Top AI Scores" alone told a first-time visitor
                        nothing about what is scored. */}
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", margin: `0 0 ${ROW_GAP}` }}>
                      {t("data.topPerforming")}
                    </p>
                    {data.topStartups.length === 0 ? (
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", padding: `${BLOCK_GAP} 0` }}>
                        {namesWithheld ? tf("data.namesWithheld", NAMES_WITHHELD_EN) : t("data.noScoresYet")}
                      </p>
                    ) : (
                      <>
                        {/* A header line names the columns, so the right-hand
                            pill is identified as the AI score before the
                            first row. The 2px ink rule over it is the classic
                            yearbook table head: heavy rule, column names,
                            light rule, then the rows. */}
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderTop: "2px solid var(--cr-ink)", paddingTop: LABEL_GAP, paddingBottom: LABEL_GAP, borderBottom: "1px solid var(--cr-rule-dark)" }}>
                          <span style={capsLabel}>{t("listings.company")}</span>
                          <span style={capsLabel}>{t("listings.aiScore")}</span>
                        </div>
                        {/* Ledger rows: the 01-style mono rail replaces the
                            monogram tile -- a rank is a number, not a
                            picture -- and .listing-row gives the house hover
                            (paper-3 wash, copper edge) shared with the
                            startups directory. */}
                        {data.topStartups.map((s, i) => (
                          <Link key={s.slug} href={`/startups/${s.slug}`} className="listing-row" style={{ display: "flex", alignItems: "center", gap: ROW_GAP, padding: `${ROW_GAP} 0`, borderBottom: "1px solid var(--cr-rule)", textDecoration: "none" }}>
                            <span className="listing-row-num" style={{ fontWeight: 700, minWidth: "24px", textAlign: "left" }}>{String(i + 1).padStart(2, "0")}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</p>
                              {/* Per-startup MRR left this public surface
                                  with the entitlement lockdown (109) -- the
                                  row would have labelled every company
                                  "Pre-rev". Industry and stage, like the
                                  recent-listings ledger. */}
                              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>{s.industry} · {STAGE_LABELS[s.stage] ?? s.stage}</p>
                            </div>
                            <ScorePill score={s.ai_score} />
                          </Link>
                        ))}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {data.recentStartups.length === 0 ? (
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", padding: `${BLOCK_GAP} 0` }}>
                        {namesWithheld ? tf("data.namesWithheld", NAMES_WITHHELD_EN) : t("data.noListingsYet")}
                      </p>
                    ) : (
                      <>
                        {/* The right-hand mono figure is the round being
                            raised; without a column name it read as any
                            number at all. Same double-rule table head as the
                            ranking beside it. */}
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", borderTop: "2px solid var(--cr-ink)", paddingTop: LABEL_GAP, paddingBottom: LABEL_GAP, borderBottom: "1px solid var(--cr-rule-dark)" }}>
                          <span style={capsLabel}>{t("listings.company")}</span>
                          <span style={capsLabel}>{t("listings.raising")}</span>
                        </div>
                        {data.recentStartups.map((s, i) => (
                          <Link key={s.slug} href={`/startups/${s.slug}`} className="listing-row" style={{ display: "flex", alignItems: "center", gap: ROW_GAP, padding: `${ROW_GAP} 0`, borderBottom: "1px solid var(--cr-rule)", textDecoration: "none" }}>
                            <span className="listing-row-num" style={{ fontWeight: 700, minWidth: "24px", textAlign: "left" }}>{String(i + 1).padStart(2, "0")}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</p>
                              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>{s.industry} · {STAGE_LABELS[s.stage] ?? s.stage}</p>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink)" }}>{fmtRaising(s.funding_target)}</p>
                              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>{timeAgo(s.created_at)}</p>
                            </div>
                          </Link>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* CTA: a closing band, not a card -- hairlines top and bottom,
                no radius, the diamond as the single ornament. It is now the
                page's only slab: the medians band that used to sit above it
                became a table, so one moment on the surface is a band and it
                is the one asking for something. */}
            <div style={{ background: "var(--cr-band-bg)", borderTop: "1px solid var(--cr-copper-br)", borderBottom: "1px solid var(--cr-copper-br)", padding: "clamp(48px, 6vw, 64px) clamp(24px, 5vw, 32px)", textAlign: "center" }}>
              <div aria-hidden style={{ fontSize: "14px", color: "var(--cr-copper)", marginBottom: ROW_GAP, lineHeight: 1 }}>{"✦"}</div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "28px", color: "var(--cr-band-ink)", marginBottom: "12px" }}>{t("data.featuredHere")}</h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-band-ink-dim)", maxWidth: "380px", margin: "0 auto 24px", lineHeight: 1.65 }}>
                {t("data.featuredHereSub")}
              </p>
              <Link href="/auth/signup?role=startup" style={{ display: "inline-flex", alignItems: "center", gap: LABEL_GAP, background: "var(--cr-copper)", color: "var(--cr-band-ink)", borderRadius: "999px", padding: "12px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}>
                {t("data.listFree")} →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
