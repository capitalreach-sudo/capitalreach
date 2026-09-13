"use client";

import { displayLocale } from "@/lib/display-locale";
import { useState, useEffect, useCallback, useId } from "react";
import { STAGE_LABELS } from "@/lib/utils";
import { RefreshCw, AlertTriangle, Download, Building2 } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { getCurrency } from "@/lib/currency";
import { InfoTip } from "@/components/shared/info-tip";
import { TabStrip, TabPanel } from "@/components/ui/tab-strip";
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
  sampleCount?: number;
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

// Tables: the same double-rule head the two ledgers set -- heavy ink rule,
// column names in Label type, hairline, then the rows -- so every table on
// the page speaks one language. Cells get 12px of air rather than the old
// 6px: the fix for a dense table is room, not fewer columns.
const tableBase: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", minWidth: "480px",
  borderTop: "2px solid var(--cr-ink)",
};
const cellTh: React.CSSProperties = {
  ...capsLabel, textAlign: "left", padding: `${LABEL_GAP} 12px`,
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

// First and last columns sit flush with the section's own edges, so a table
// lines up with the tab strip and captions above it instead of floating 12px
// inside them.
const cellThFirst: React.CSSProperties = { ...cellTh, paddingLeft: 0 };
const cellThNumLast: React.CSSProperties = { ...cellThNum, paddingRight: 0 };
const cellTdFirst: React.CSSProperties = { ...cellTd, paddingLeft: 0 };
const cellTdNumLast: React.CSSProperties = { ...cellTdNum, paddingRight: 0 };

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
  const name = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString(displayLocale(), { month: "short", timeZone: "UTC" });
  return m === "01" ? `${name} ${y.slice(2)}` : name;
}

/** "2026-09" → "Sep 2026", for captions that name a month in prose. */
function monthLong(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString(displayLocale(), { month: "short", year: "numeric", timeZone: "UTC" });
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
    // "Verified investors" stood here while the card for the same number said
    // "Investors", which broke this function's own rule above and exported a
    // verification claim the platform does not make.
    ["headline", "Investors", d.investorCount],
    // The currency rides in the label: an unlabelled 1,655,000 in a CSV is
    // whatever the reader's spreadsheet assumes.
    ["headline", `Total raised${d.closedCurrencies?.length ? ` (${d.closedCurrencies.join("+")})` : ""}`, d.totalRaised],
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

// InfoTip resolves its termKey through t(), and t() echoes an unknown key
// back raw. The glossary keys this pass adds are new, so until the
// dictionaries carry them the English wording itself is passed as the key:
// t() returns unknown strings verbatim, which is the same fallback path the
// component's tf() gives plain labels.
const tipKey = (t: (k: string) => string, key: string, fallback: string) =>
  t(key) === key ? fallback : key;

// What each funnel stage means, hoverable where the label stands. Diligence
// and the term sheet reuse the glossary entries the rest of the product
// defines them with; the other three are counting notes for this funnel.
const STAGE_TIP: Record<(typeof DEAL_STAGES)[number]["key"], { key: string; fallback: string }> = {
  intro:         { key: "glossary.stageIntro",  fallback: "The first working stage: the two sides are connected and talking. Nothing is committed yet, and a deal moves one stage at a time as the conversation firms up." },
  due_diligence: { key: "glossary.dueDiligence", fallback: "The investigation an investor runs before committing money: reading the financials, talking to customers, checking the claims on the listing against evidence." },
  term_sheet:    { key: "glossary.termSheet",    fallback: "The document that fixes the terms of the investment, amount, valuation and rights, before the final contracts. Signing one means the negotiation is over and the lawyers begin." },
  closed:        { key: "glossary.dealsClosed", fallback: "Deals both sides confirmed as an investment made, counted since the platform opened. A deal that ended in a pass is recorded separately and never counted here." },
  passed:        { key: "glossary.stagePassed", fallback: "The deal ended without an investment, with the reason recorded. Passing concludes the deal but not the relationship: a passed deal can be reopened if talks restart." },
};

// Goes through the shared safety net, which renders an absence dash for
// implausible values rather than a wrong number.
function fmtRaising(n: number | null | undefined) { return safeFormatCurrency(n); }

function timeAgo(iso: string) {
  // Localized: the old English "0m ago" was interpolated INTO localized
  // sentences ("0m agoに更新" on the Japanese page).
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  try {
    const rtf = new Intl.RelativeTimeFormat(displayLocale(), { numeric: "auto", style: "narrow" });
    if (secs < 60) return rtf.format(0, "second").replace(/^in /, "");
    if (secs < 3600) return rtf.format(-Math.floor(secs / 60), "minute");
    if (secs < 86400) return rtf.format(-Math.floor(secs / 3600), "hour");
    return rtf.format(-Math.floor(secs / 86400), "day");
  } catch {
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }
}

// ── Stat ──────────────────────────────────────────────────────────────────────

// The boxed tile is gone: an annual report rules a figure, it does not
// frame it. Each stat is an overline hairline, a small-caps label and a
// confident mono figure sitting directly on the paper. `lead` promotes the
// one commanding figure on the page, under a heavier ink rule. Figures
// render settled: the SSR HTML already carries the real values, and a page
// that promises its numbers must not perform them.
function StatCard({ label, value, prefix = "", lead = false, tip }: {
  label: string;
  value: number;
  prefix?: string;
  lead?: boolean;
  /** One InfoTip beside the label: what this total counts, what it excludes. */
  tip?: React.ReactNode;
}) {
  return (
    <div style={{
      borderTop: lead ? "2px solid var(--cr-ink)" : "1px solid var(--cr-rule-dark)",
      // A full step apart, not 16 beside 12: near-equal insets on the lead
      // and its supporters read as a mistake rather than a hierarchy.
      paddingTop: lead ? "24px" : "12px",
    }}>
      <p style={{ ...capsLabel, ...(lead ? { color: "var(--cr-ink-3)" } : null), marginBottom: LABEL_GAP }}>{label}{tip}</p>
      <p style={{ ...monoFigure, fontSize: lead ? FIG_LEAD : FIG_2, overflowWrap: "anywhere" }}>
        {prefix}{value.toLocaleString()}
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
      // The tint alone frames the chip; a border on top of it was a second
      // frame around the same number.
      color, background: `color-mix(in srgb, ${color} 8%, transparent)`,
      borderRadius: "3px", padding: "2px 8px",
    }}>
      {score}
    </span>
  );
}

// ── Paired monthly columns ────────────────────────────────────────────────────

interface ColumnSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
  /** Formats the value label above a bar; defaults to the raw number. */
  format?: (n: number) => string;
}

/**
 * Form follows density: below eight complete months a line is a squiggle
 * between too few points, and paired columns read each month as the discrete
 * count it is. Value labels ride above every bar at these small counts, so
 * the frame needs no y-grid at all -- the baseline hairline is the only rule.
 *
 * Interaction matches the line chart's contract: per-column hover and a
 * keyboard scrub emphasise one month at a time; every figure is already on
 * the surface, so nothing is gated behind either. Columns render settled --
 * no draw-in to rerun on a tab switch, nothing for reduced motion to skip.
 */
function PairedColumns({ labels, series, ariaLabel }: {
  labels: string[];
  series: ColumnSeries[];
  ariaLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = labels.length;
  const max = Math.max(1, ...series.flatMap(s => s.values.filter(Number.isFinite)));
  const PLOT_H = 148;

  const fmt = (s: ColumnSeries, v: number) => (s.format ? s.format(v) : String(v));

  return (
    <div
      // .cr-chart carries the house focus-visible ring; no inline outline
      // here, or the keyboard scrub would be invisible to the person using it.
      className="cr-chart"
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { setActive(a => Math.min(n - 1, (a ?? -1) + 1)); e.preventDefault(); }
        else if (e.key === "ArrowLeft") { setActive(a => Math.max(0, (a ?? n) - 1)); e.preventDefault(); }
        else if (e.key === "Home") { setActive(0); e.preventDefault(); }
        else if (e.key === "End") { setActive(n - 1); e.preventDefault(); }
        else if (e.key === "Escape") setActive(null);
      }}
      onBlur={() => setActive(null)}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {labels.map((label, i) => {
          const dim = active !== null && active !== i;
          return (
            <div
              key={label + i}
              // Mouse only: on touch, pointerenter fires on tap with no
              // matching leave, which would leave the other months dimmed.
              onPointerEnter={(e) => { if (e.pointerType !== "touch") setActive(i); }}
              onPointerLeave={(e) => { if (e.pointerType !== "touch") setActive(null); }}
              style={{ flex: "1 1 0", minWidth: 0, opacity: dim ? 0.45 : 1, transition: "opacity 120ms" }}
            >
              {/* Cells sit flush (no flex gap) so each cell's bottom border
                  joins its neighbours' into one continuous baseline. */}
              <div style={{
                display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "4px",
                height: `${PLOT_H + 22}px`, padding: "0 4px",
                borderBottom: "1px solid var(--cr-rule-dark)",
              }}>
                {series.map((s) => {
                  const v = Number.isFinite(s.values[i]) ? s.values[i] : 0;
                  const h = Math.round((v / max) * PLOT_H);
                  return (
                    <div key={s.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", minWidth: 0 }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: "10px",
                        fontVariantNumeric: "tabular-nums",
                        color: v > 0 ? "var(--cr-ink-3)" : "var(--cr-ink-4)",
                      }}>
                        {fmt(s, v)}
                      </span>
                      <div style={{
                        width: "clamp(10px, 3vw, 24px)", height: `${h}px`,
                        background: s.color, borderRadius: "2px 2px 0 0",
                      }} />
                    </div>
                  );
                })}
              </div>
              <p style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: "10px",
                fontVariantNumeric: "tabular-nums", textAlign: "center", marginTop: "8px",
                color: active === i ? "var(--cr-ink)" : "var(--cr-ink-3)",
              }}>
                {label}
              </p>
            </div>
          );
        })}
      </div>
      {/* Colour never carries identity alone: the legend names each column of
          the pair, in the quiet ink the line chart's legend uses. */}
      {series.length > 1 && (
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "8px" }}>
          {series.map((s) => (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-3)" }}>
              <span style={{ width: "10px", height: "6px", borderRadius: "1px", background: s.color, display: "inline-block" }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
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
  // Opens on what was listed, not on what scored highest. A ranking is the
  // default reading of whatever sits first, and this one ranks a completeness
  // check -- leading with it invites it to be read as a recommendation.
  const [ledger, setLedger] = useState<"scores" | "recent">("recent");

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
  // Interior empty months stay plotted -- dropping one draws a segment across
  // the gap and lies about steadiness. LEADING emptiness is different: months
  // before the platform's first recorded activity say nothing, so the plotted
  // domain starts at the first month with any, and one caption line under the
  // chart owns the quiet before it. The numbers tab and the CSV keep the full
  // window -- a ledger does not trim its own history.
  const firstActive = monthly.findIndex(m => m.listings > 0 || m.closed > 0 || m.sought > 0);
  const plotMonths = firstActive > 0 ? monthly.slice(firstActive) : monthly;
  // The window's last month is the one still being written -- three days into
  // it, "deals closed this month" is a partial count, not a collapse. Marked
  // only when the series actually ends at the snapshot's own month, so a
  // pinned or stale window is not decorated with a claim about today.
  const lastInProgress = !!data && plotMonths.length > 0
    && plotMonths[plotMonths.length - 1].month === data.lastUpdated.slice(0, 7);
  // The in-progress month is never a plotted point: a partial count on the
  // same axis as complete months reads as a collapse whatever decoration it
  // wears. The plotted series ends at the last complete month; the current
  // one is a sentence under the frame. The numbers tab and the CSV keep it.
  const completeMonths = lastInProgress ? plotMonths.slice(0, -1) : plotMonths;
  const currentMonth = lastInProgress ? plotMonths[plotMonths.length - 1] : null;
  // Form follows density: eight complete months earn a line; fewer render as
  // paired columns, because a line between five points is a squiggle claiming
  // a trend the data cannot carry.
  const chartAsLine = completeMonths.length >= 8;
  const industryEntries = data
    ? Object.entries(data.byIndustry).sort((a, b) => b[1] - a[1])
    : [];
  const industryTotal = industryEntries.reduce((s, [, v]) => s + v, 0);
  // A ring answers "what share of the whole" only while named slices carry
  // the whole. The donut folds everything past its five named slices into a
  // grey "Other"; once that fold holds more than half the platform, the ring
  // is mostly a non-category and a ranked list answers better.
  const industryNamed = industryEntries.slice(0, 5).reduce((s, [, v]) => s + v, 0);
  const industryAsBars = industryTotal > 0 && industryTotal - industryNamed > industryTotal / 2;
  const stageEntries = data
    ? Object.entries(data.byStage).sort((a, b) => b[1] - a[1])
    : [];
  const medianEntries = data
    ? Object.entries(data.report?.medianByStage ?? {}).sort((a, b) => (data.byStage[b[0]] ?? 0) - (data.byStage[a[0]] ?? 0))
    : [];

  // The strip only offers a tab it can fill, and the selected tab falls back
  // to the first available one -- a tab that opens on "no data yet" exists
  // only to say it shows nothing, so it is not offered at all.
  const breakdownTabs = [
    ...(data && Object.values(data.byDealStage).some(v => v > 0)
      ? [{ key: "deals" as const, label: t("data.dealFlow") }] : []),
    ...(industryTotal > 0 ? [{ key: "industry" as const, label: tf("data.tabIndustry", "Industry") }] : []),
    ...(stageEntries.length > 0 ? [{ key: "stage" as const, label: t("listings.stage") }] : []),
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
    { key: "recent" as const, label: t("data.recentListings") },
    { key: "scores" as const, label: tf("data.byConsistency", "By consistency score") },
  ];

  // One caption line owns what the plotted domain cannot say for itself: the
  // month still being written, and the quiet before the first active month.
  // It sits under both chart tabs; the numbers tab needs neither, because
  // the full window is right there.
  const quietLine = firstActive > 0 && completeMonths.length > 0
    ? tf("data.quietBefore", "Nothing was listed or closed before {month}, so the chart starts there.").replace("{month}", monthLong(completeMonths[0].month))
    : "";
  const soFarActivity = currentMonth
    ? tf("data.monthSoFar", "{month} so far: {listings} new listings, {closed} deals closed.")
        .replace("{month}", monthLong(currentMonth.month))
        .replace("{listings}", String(currentMonth.listings))
        .replace("{closed}", String(currentMonth.closed))
    : "";
  const soFarCapital = currentMonth
    ? tf("data.monthSoFarCapital", "{month} so far: {sought} sought by new listings.")
        .replace("{month}", monthLong(currentMonth.month))
        .replace("{sought}", safeFormatTotal(currentMonth.sought))
    : "";
  const activityCaption = [soFarActivity, quietLine].filter(Boolean).join(" ");
  const capitalCaption = [soFarCapital, quietLine].filter(Boolean).join(" ");

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
            content at 375px, which forced every grid into a squeeze. The
            vertical step ties to viewport height so the whole band stays
            near 40vh on a phone -- the lead figure below it belongs in the
            first viewport, and a masthead that fills the screen buries it. */}
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: `clamp(32px, 6vh, 64px) clamp(24px, 5vw, 32px)` }}>
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
          {/* The colophon: one hairline, the freshness stamp, the export.
              Nothing performs liveness -- a quiet 60s refresh keeps the
              numbers current, and the stamp is the honest record of it. */}
          {data && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px 12px", marginTop: BLOCK_GAP, paddingTop: ROW_GAP, borderTop: "1px solid color-mix(in srgb, var(--cr-band-ink) 18%, transparent)", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-band-ink-dim)" }}>
                {t("data.updated", { time: timeAgo(data.lastUpdated) })}
              </span>
              <span aria-hidden style={{ fontSize: "11px", color: "var(--cr-band-ink-dim)" }}>·</span>
              <button
                onClick={() => exportPlatformCsv(data)}
                style={{ display: "flex", alignItems: "center", gap: LABEL_GAP, background: "none", border: "none", cursor: "pointer", color: "var(--cr-band-ink-dim)", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", padding: 0, minHeight: "40px" }}
              >
                <Download style={{ width: 12, height: 12 }} />
                {t("data.exportCsv")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: `${SECTION_GAP} clamp(24px, 5vw, 32px) 96px` }}>

        {/* Loading: the ledger being written, not a soup of gray bars. */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "96px 0" }}>
            <LedgerLoader label={t("data.loading")} />
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "96px 24px", textAlign: "center" }}>
            {/* Ink, not copper: the view's one accent is the retry button. */}
            <AlertTriangle style={{ width: 32, height: 32, color: "var(--cr-ink-3)", marginBottom: ROW_GAP }} />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: LABEL_GAP }}>{t("data.errorTitle")}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginBottom: "24px" }}>{t("data.errorSub")}</p>
            <button
              onClick={fetchData}
              style={{ display: "flex", alignItems: "center", gap: LABEL_GAP, background: "var(--cr-copper)", color: "var(--cr-on-accent, var(--cr-band-ink))", border: "none", borderRadius: "var(--radius, 4px)", padding: "12px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
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
              {/* Not the page eyebrow again: this rule sat directly under the
                  masthead carrying the identical words, so the first thing the
                  page said twice was its own name. */}
              <div className="ruled-label" style={{ marginBottom: BLOCK_GAP }}>{tf("data.totalsLabel", "Totals to date")}</div>
              {/* The one InfoTip in this chapter: the lead total is the only
                  figure whose counting rules need disclosing, and it says
                  what it counts and excludes on hover, focus and tap. */}
              {/* The symbol comes from the DEALS, not from a hardcode: all
                  closed rounds to date are EUR, and the page was claiming the
                  sum in dollars. One currency -> its own symbol; a mixed book
                  -> no symbol, with the mix disclosed right here rather than
                  two tabs away. */}
              <StatCard lead label={t("data.raised")} value={data.totalRaised}
                prefix={data.closedCurrencies?.length === 1 ? getCurrency(data.closedCurrencies[0]).symbol : ""}
                tip={<InfoTip termKey={tipKey(t, "glossary.totalRaised", "Every amount confirmed at the close of a deal here, summed to date. Money still being negotiated or soft-circled is not counted, and passed deals never enter the figure.")} />} />
              {(data.closedCurrencies?.length ?? 0) > 1 && (
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: "4px" }}>
                  {t("data.multiCurrencyNote", { list: data.closedCurrencies.join(", ") })}
                </p>
              )}
              {/* The three supporting totals as one hairline-divided strip:
                  vertical rules between the figures, not a grid of tiles.
                  The crop trick (overflow hidden + a negative margin equal to
                  the cell's own inset) hides the first divider in every wrap
                  state, so the strip is flush left on desktop and each stat
                  stacks clean at phone widths. */}
              {/* The supporting totals speak through their caps labels alone:
                  once "Active startups" reads, a tooltip restating it is a
                  second voice on a self-explanatory figure. */}
              <div style={{ overflow: "hidden", marginTop: BLOCK_GAP }}>
                <div style={{ display: "flex", flexWrap: "wrap", rowGap: BLOCK_GAP, marginLeft: "-24px" }}>
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
              {/* The sample-data disclosure lives with the figures it
                  qualifies, as a labelled caption -- in the masthead it was
                  a disclaimer on the page's name rather than on its numbers.
                  Gated on samples actually being counted: after the seed
                  purge the note itself would be the false statement. */}
              {(data.sampleCount ?? 0) > 0 && (
                <div style={{ marginTop: BLOCK_GAP }}>
                  <p style={{ ...capsLabel, marginBottom: LABEL_GAP }}>{tf("data.sampleDataLabel", "Sample data")}</p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", maxWidth: "560px", lineHeight: 1.6 }}>
                    {t("data.sampleNote")}
                  </p>
                </div>
              )}
            </section>

            {/* ── The one primary chart ─────────────────────────────────────
                Totals say how big the platform is and nothing about whether
                it is growing, so growth is the single chart the page shows on
                arrival. Interior empty months stay: dropping one draws a
                straight line across the gap, which reads as steady activity
                and is the opposite of what happened. Leading empty months go,
                because a chart spending half its width on a flat zero says
                nothing -- the caption under the frame owns that quiet.
                Capital sits on its own tab rather than its own frame -- two
                units in one eyeful was two charts where the reader needed
                one -- and the numbers behind both are the third tab. */}
            {monthly.length > 0 && firstActive !== -1 && (
              <section style={{ marginBottom: SECTION_GAP }}>
                <div className="ruled-label" style={{ marginBottom: ROW_GAP }}>{t("data.overTime")}</div>
                <TabStrip
                  tabs={growthTabs}
                  active={growthView}
                  onSelect={setGrowthView}
                  idBase={growthId}
                  label={t("data.overTime")}
                  style={{ marginBottom: BLOCK_GAP }}
                />
                <TabPanel idBase={growthId} active={growthView}>
                  {growthView === "numbers" ? (
                    /* Every chart has a table behind it: some of these fills
                       sit below 3:1 against paper, and a reader who cannot
                       separate them still needs the numbers. */
                    <div style={{ overflowX: "auto" }}>
                      <table style={tableBase}>
                        <thead>
                          <tr>
                            {/* Ledger alignment: the month reads left, every
                                figure right, so magnitudes line up down each
                                column the way a yearbook sets them. */}
                            {[t("data.month"), t("data.newListings"), t("data.dealsClosed"), t("data.capitalSought")].map((h, i) => (
                              <th key={h} style={i === 0 ? cellThFirst : i === 3 ? cellThNumLast : cellThNum}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {monthly.map((m, i) => (
                            <tr key={m.month}>
                              <td style={cellTdFirst}>
                                {m.month}
                                {/* The last row is a month in progress; its
                                    figures are partial counts and must say so
                                    in the same cell that names the month. */}
                                {lastInProgress && i === monthly.length - 1 && (
                                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", color: "var(--cr-ink-4)", marginLeft: "8px" }}>
                                    {tf("data.soFar", "so far")}
                                  </span>
                                )}
                              </td>
                              <td style={cellTdNum}>{m.listings}</td>
                              <td style={cellTdNum}>{m.closed}</td>
                              {/* A total, not one listing's figure: the
                                  per-listing bound prints a legitimate month
                                  as an absence while the chart plots it. */}
                              <td style={cellTdNumLast}>{safeFormatTotal(m.sought)}</td>
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
                      <p style={{ ...capsLabel, margin: `0 0 ${ROW_GAP}` }}>
                        {t("data.capitalSought")}
                        <span className="mono" style={{ textTransform: "none", fontWeight: 500, letterSpacing: 0, marginLeft: LABEL_GAP, color: "var(--cr-ink-4)" }}>$/mo</span>
                      </p>
                      {completeMonths.length > 0 && (chartAsLine ? (
                        <LineChart
                          height={200}
                          labels={completeMonths.map(m => monthLabel(m.month))}
                          formatTick={(n) => (n === 0 ? "0" : compactMoney(n))}
                          series={[{ key: "sought", label: t("data.capitalSought"), values: completeMonths.map(m => m.sought), format: safeFormatTotal }]}
                          annotation={capitalCaption || undefined}
                        />
                      ) : (
                        <>
                          <PairedColumns
                            labels={completeMonths.map(m => monthLabel(m.month))}
                            series={[{ key: "sought", label: t("data.capitalSought"), color: "var(--cr-copper)", values: completeMonths.map(m => m.sought), format: safeFormatTotal }]}
                            ariaLabel={t("data.capitalSought")}
                          />
                          {capitalCaption && (
                            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: ROW_GAP, maxWidth: "560px", lineHeight: 1.6 }}>
                              {capitalCaption}
                            </p>
                          )}
                        </>
                      ))}
                      {/* A window whose only month is still in progress has
                          no chart to draw; the caption carries the month. */}
                      {completeMonths.length === 0 && capitalCaption && (
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", maxWidth: "560px", lineHeight: 1.6 }}>
                          {capitalCaption}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      {/* The caption names both series in the frame; the mono
                          "/mo" says what one mark IS -- a count for that
                          month, not a running total. */}
                      <p style={{ ...capsLabel, margin: `0 0 ${ROW_GAP}` }}>
                        {t("data.newListings")} · {t("data.dealsClosed")}
                        <span className="mono" style={{ textTransform: "none", fontWeight: 500, letterSpacing: 0, marginLeft: LABEL_GAP, color: "var(--cr-ink-4)" }}>/mo</span>
                      </p>
                      {completeMonths.length > 0 && (chartAsLine ? (
                        <LineChart
                          height={200}
                          labels={completeMonths.map(m => monthLabel(m.month))}
                          series={[
                            { key: "listings", label: t("data.newListings"), values: completeMonths.map(m => m.listings) },
                            { key: "closed", label: t("data.dealsClosed"), values: completeMonths.map(m => m.closed) },
                          ]}
                          annotation={activityCaption || undefined}
                        />
                      ) : (
                        <>
                          <PairedColumns
                            labels={completeMonths.map(m => monthLabel(m.month))}
                            series={[
                              { key: "listings", label: t("data.newListings"), color: "var(--cr-copper)", values: completeMonths.map(m => m.listings) },
                              { key: "closed", label: t("data.dealsClosed"), color: "var(--cr-ink-2)", values: completeMonths.map(m => m.closed) },
                            ]}
                            ariaLabel={`${t("data.newListings")} · ${t("data.dealsClosed")}`}
                          />
                          {activityCaption && (
                            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: ROW_GAP, maxWidth: "560px", lineHeight: 1.6 }}>
                              {activityCaption}
                            </p>
                          )}
                        </>
                      ))}
                      {completeMonths.length === 0 && activityCaption && (
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", maxWidth: "560px", lineHeight: 1.6 }}>
                          {activityCaption}
                        </p>
                      )}
                    </>
                  )}
                </TabPanel>
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
            {breakdownTabs.length > 0 && (
            <section style={{ marginBottom: SECTION_GAP }}>
              <div className="ruled-label" style={{ marginBottom: ROW_GAP }}>{tf("data.breakdowns", "Breakdowns")}</div>
              <TabStrip
                tabs={breakdownTabs}
                active={activeBreakdown}
                onSelect={setBreakdown}
                idBase={breakdownId}
                label={tf("data.breakdowns", "Breakdowns")}
                style={{ marginBottom: BLOCK_GAP }}
              />
              <TabPanel idBase={breakdownId} active={activeBreakdown}>
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
                          {t("data.closeRate")}
                          <InfoTip termKey={tipKey(t, "glossary.closeRate", "Of the deals that have ended, the share that closed rather than passed. Deals still in progress count toward neither side, so this is not the share of all deals that succeed.")} />{" "}
                          <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums", fontSize: "13px", color: "var(--cr-ink)" }}>{data.closeRate}%</strong>
                          {/* The denominator is deals that ENDED, closed plus
                              passed. Every still-open deal is excluded, so an
                              unqualified figure reads as the share of all
                              deals here that close, which it is not. */}
                          <span style={{ color: "var(--cr-ink-4)" }}> {tf("data.closeRateBasis", "of deals that ended")}</span>
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
                        {DEAL_STAGES.map(({ key, color }) => {
                          const n = data.byDealStage[key] ?? 0;
                          const max = Math.max(...Object.values(data.byDealStage), 1);
                          return (
                            <div key={key} style={{ flex: "1 1 150px", minWidth: 0, display: "flex", flexDirection: "column", borderTop: "1px solid var(--cr-rule-dark)", borderLeft: "1px solid var(--cr-rule)", padding: "12px 24px 0" }}>
                              {/* No 01-05 rail here. Numbering a row of
                                  figures asserts that one becomes the next,
                                  and these are occupancy counts: how many
                                  deals stand at each stage right now, read at
                                  one instant. Intro 8 beside Diligence 10 is
                                  ordinary for a distribution and impossible
                                  for a cohort, so the device was claiming a
                                  flow the numbers cannot show. The columns
                                  keep pipeline order, which is real; what went
                                  is the implication that they are a sequence. */}
                              {/* The base Label voice, and the label-to-figure
                                  gap every other labelled figure uses: 9px
                                  with wider tracking was a third caps size
                                  the page did not need. */}
                              <p style={{ ...capsLabel, marginBottom: LABEL_GAP }}>
                                {t(`data.stage_${key}`)}
                                <InfoTip termKey={tipKey(t, STAGE_TIP[key].key, STAGE_TIP[key].fallback)} />
                              </p>
                              {/* Same figure size as every other second-rank
                                  number on the page. The meter pins to the
                                  bottom so the five bars align even when a
                                  stage name wraps. */}
                              <p style={{ ...monoFigure, fontSize: FIG_2, marginBottom: "12px" }}>{n}</p>
                              {/* The track is capped at a fixed width: when
                                  the strip wraps, cells differ in width, and
                                  a percentage of the cell would give the same
                                  count a longer bar on a wider row. 6px deep
                                  so the meter reads as a mark, not a rule. */}
                              <div style={{ height: "6px", maxWidth: "120px", background: "var(--cr-paper-3)", borderRadius: "3px", overflow: "hidden", marginTop: "auto" }}>
                                <div style={{ width: `${(n / max) * 100}%`, height: "100%", background: color }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Says what the row is before anyone reads it as a
                        funnel. Without this the two largest bars sit at the
                        end and the strip appears to show deals multiplying. */}
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: ROW_GAP, maxWidth: "560px", lineHeight: 1.6 }}>
                      {tf("data.stageDistributionNote", "Deals standing at each stage right now. Closed and passed are totals to date, so this is a snapshot rather than one group moving left to right.")}
                    </p>

                    {data.closedCurrencies?.length > 1 && (
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", marginTop: ROW_GAP }}>
                        {t("data.multiCurrencyNote", { list: data.closedCurrencies.join(", ") })}
                      </p>
                    )}
                  </>
                )}

                {/* Industry: share of the whole -- the one question a ring
                    answers better than bars, but only while named slices
                    carry the whole. The donut folds its tail into a grey
                    "Other"; the moment that fold holds most of the platform
                    the ring is one non-category, so the breakdown renders as
                    a ranked list instead -- every industry, largest first,
                    in one quiet colour, because a ranked list orders by
                    magnitude and needs no identity hues. */}
                {activeBreakdown === "industry" && (
                  industryAsBars ? (
                    <div style={{ maxWidth: "560px" }}>
                      <BarChart
                        bars={industryEntries.map(([label, count]) => ({
                          key: label, label, value: count, colorIndex: 1,
                        }))}
                        hrefFor={(industry) => `/startups?industries=${encodeURIComponent(industry)}`}
                      />
                    </div>
                  ) : (
                    <DonutChart
                      slices={industryEntries.map(([label, count]) => ({ key: label, label, value: count }))}
                      otherLabel={t("data.otherIndustries")}
                      hrefFor={(industry) => `/startups?industries=${encodeURIComponent(industry)}`}
                    />
                  )
                )}

                {/* Stage breakdown */}
                {activeBreakdown === "stage" && (
                  <BarChart
                    bars={stageEntries.map(([label, count]) => ({
                      key: label, label: STAGE_LABELS[label] ?? label, value: count,
                    }))}
                    hrefFor={(stage) => `/startups?stages=${encodeURIComponent(stage)}`}
                  />
                )}

                {/* Medians, not means: one mega-round must not move what the
                    market calls a typical raise. This was a slab of 52px
                    copper figures competing with the page's lead total; as a
                    ruled table it holds every stage instead of three, and the
                    figures sit in ink where they belong. */}
                {activeBreakdown === "medians" && data.report && (
                  <>
                    {/* Capped at the caption measure: on a wide page a full
                        span put half a screen of nothing between a stage and
                        its figure, and a ledger is read across, not around. */}
                    <div style={{ overflowX: "auto", maxWidth: "560px" }}>
                      <table style={{ ...tableBase, minWidth: "360px" }}>
                        <thead>
                          <tr>
                            <th style={cellThFirst}>{t("listings.stage")}</th>
                            {/* What a median IS, where the medians are read:
                                the wrong mental model here is "average", and
                                one mega-round makes that model lie. */}
                            <th style={cellThNum}>{t("report.medianTarget")}<InfoTip termKey={tipKey(t, "glossary.medianTarget", "The middle round target among listings at that stage: half ask for more, half ask for less. A median rather than an average, so one outsized round cannot move the figure.")} /></th>
                            <th style={cellThNumLast}>{tf("data.listingsCount", "Listings")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {medianEntries.map(([stage, median]) => (
                            <tr key={stage}>
                              <td style={{ ...cellTdFirst, fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink)" }}>
                                {(STAGE_LABELS[stage] ?? stage).replace(/_/g, " ")}
                              </td>
                              <td style={{ ...cellTdNum, color: "var(--cr-ink)", fontWeight: 600 }}>{medianMoney(median)}</td>
                              <td style={cellTdNumLast}>{data.byStage[stage] ?? 0}</td>
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
              </TabPanel>
            </section>
            )}

            {/* ── The rounds themselves ─────────────────────────────────────
                After the aggregates, the individual listings. Two ledgers
                that used to sit side by side, each with its own heading and
                its own "view all", now share one opener and one link: the
                ranking and the newest rounds are a tap apart, and a phone
                gets one ledger at a time instead of twelve stacked rows. */}
            {/* The withheld note says something real -- names exist and are
                part of a paid plan -- so it renders. A ledger chapter whose
                only line would be "no listings yet" says nothing the totals
                above have not already said, so it renders nothing. */}
            {(data.topStartups.length > 0 || data.recentStartups.length > 0 || namesWithheld) && (
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
                style={{ marginBottom: BLOCK_GAP }}
              />
              <TabPanel idBase={ledgerId} active={ledger} style={{ minWidth: 0 }}>
                {ledger === "scores" ? (
                  <>
                    {/* What the number is, attached to the only place it is
                        ranked. "Top performing startups" stood here, which
                        names investment performance: this score reads a
                        submission for completeness and internal consistency
                        and has never seen a return. The caption travels with
                        the ranking rather than sitting in a tooltip, because
                        a ranking is read at a glance and a tooltip is not. */}
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", margin: `0 0 ${LABEL_GAP}`, maxWidth: "560px", lineHeight: 1.6 }}>
                      {tf("data.consistencyLead", "Listings ranked by AI consistency score.")}
                    </p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)", margin: `0 0 ${ROW_GAP}`, maxWidth: "560px", lineHeight: 1.6 }}>
                      {tf("data.consistencyCaption", "Measures completeness and internal consistency of the submission. Not a prediction of returns, not investment advice, and not a verification of any figure.")}
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
                        <div style={{ display: "flex", alignItems: "center", gap: ROW_GAP, borderTop: "2px solid var(--cr-ink)", paddingTop: LABEL_GAP, paddingBottom: LABEL_GAP, borderBottom: "1px solid var(--cr-rule-dark)" }}>
                          {/* The spacer mirrors the rank rail below, so the
                              column name sits over the names it labels rather
                              than over the numbering. */}
                          <span aria-hidden style={{ minWidth: "24px" }} />
                          <span style={{ ...capsLabel, flex: 1 }}>{t("listings.company")}</span>
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
                        <div style={{ display: "flex", alignItems: "center", gap: ROW_GAP, borderTop: "2px solid var(--cr-ink)", paddingTop: LABEL_GAP, paddingBottom: LABEL_GAP, borderBottom: "1px solid var(--cr-rule-dark)" }}>
                          {/* Same spacer as the ranking's head: the rail is
                              part of the row grid, and the head follows it. */}
                          <span aria-hidden style={{ minWidth: "24px" }} />
                          <span style={{ ...capsLabel, flex: 1 }}>{t("listings.company")}</span>
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
              </TabPanel>
            </section>
            )}

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
              {/* The register's own control radius, not a pill; text on the
                  accent fill reads --cr-on-accent where the token exists and
                  falls back to the band ink so token order never matters. */}
              <Link href="/auth/signup?role=startup" style={{ display: "inline-flex", alignItems: "center", gap: LABEL_GAP, background: "var(--cr-copper)", color: "var(--cr-on-accent, var(--cr-band-ink))", borderRadius: "var(--radius, 4px)", padding: "12px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}>
                {t("data.listFree")} →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
