"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { STAGE_LABELS } from "@/lib/utils";
import {
  TrendingUp, BarChart3, Users, DollarSign,
  Zap, Activity, Building2, Brain,
  Loader2, RefreshCw, AlertTriangle, Download,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { LiveClock } from "@/components/ui/LiveClock";
import { safeFormatCurrency } from "@/lib/format";
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
  lastUpdated: string;
}

const cellTd: React.CSSProperties = {
  padding: "6px 8px", fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px",
  color: "var(--cr-ink-2)", borderTop: "1px solid var(--cr-rule)",
};

/** Axis money: "$100M", never "100000000". */
function compactMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${Math.round(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
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
    ["headline", "Close rate", d.closeRate == null ? "" : `${Math.round(d.closeRate * 100)}%`],
    ...Object.entries(d.byDealStage).map(([k, v]) => ["deal_stage", k, v] as [string, string, number]),
    ...Object.entries(d.byIndustry).map(([k, v]) => ["industry", k, v] as [string, string, number]),
    ...Object.entries(d.byStage).map(([k, v]) => ["startup_stage", k, v] as [string, string, number]),
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
// outcomes. Colours match the Deal Portal's own columns so the public view and
// the signed-in board read as the same object.
const DEAL_STAGES = [
  { key: "intro",         color: "#8A8178" },
  { key: "due_diligence", color: "#3B82F6" },
  { key: "term_sheet",    color: "var(--cr-copper)" },
  { key: "closed",        color: "var(--cr-up)" },
  { key: "passed",        color: "#B43232" },
] as const;

// The canonical map lives in lib/utils. A local copy here had the wrong
// keys (pre_seed / series_b vs the DB's pre-seed / series_b_plus), so the
// stage breakdown and recent listings showed raw enum values for half the
// stages.

function fmtMrr(n: number | null, preRevLabel = "Pre-rev") {
  if (!n) return preRevLabel;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

// Both go through the shared safety net: implausible values render "—".
function fmtRaising(n: number | null | undefined) { return safeFormatCurrency(n); }
function fmtMoney(n: number | null | undefined)   { return safeFormatCurrency(n); }

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

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, prefix = "", Icon, color,
}: {
  label: string;
  value: number;
  prefix?: string;
  Icon: React.ElementType;
  color: string;
}) {
  const { value: displayed, done } = useCountUp(value);
  return (
    <div style={{
      background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)",
      borderRadius: "4px", padding: "20px 22px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", color: "var(--cr-ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
        <Icon style={{ width: 13, height: 13, color: "var(--cr-paper-4)" }} />
      </div>
      <p
        className={done ? "count-glow-done" : ""}
        style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "clamp(20px, 2.2vw + 8px, 32px)", color: "var(--cr-ink)", lineHeight: 1, overflowWrap: "anywhere" }}
      >
        {prefix}{displayed.toLocaleString()}
      </p>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "20px 22px" }}>
      <div style={{ height: 10, width: "55%", background: "var(--cr-paper-4)", borderRadius: 3, marginBottom: 16, opacity: 0.6 }} />
      <div style={{ height: 32, width: "40%", background: "var(--cr-paper-4)", borderRadius: 3, opacity: 0.5 }} />
    </div>
  );
}

// ── Animated bar chart row ────────────────────────────────────────────────────


// ── Score pill ────────────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number | null }) {
  if (!score) return <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>—</span>;
  const color = score >= 80 ? "var(--cr-up)" : score >= 60 ? "var(--cr-copper)" : score >= 40 ? "#B45309" : "#B91C1C";
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "11px",
      color, background: `${color}14`, border: `1px solid ${color}40`,
      borderRadius: "3px", padding: "2px 7px",
    }}>
      {score}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DataCentre({ initialData }: { initialData?: PlatformData | null } = {}) {
  const { t } = useTranslation();
  // Server-rendered aggregate (lib/platform-data) means the first paint is
  // the finished dashboard; the fetch below only runs for refresh/retry.
  const [data, setData] = useState<PlatformData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(false);
  // Every chart has a table behind it, for anyone the colours fail.
  const [showTable, setShowTable] = useState(false);

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
  // tab is visible (no spinner — setLoading stays untouched on refreshes so
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

  return (
    <div className="data-page-bg" style={{ minHeight: "100vh", background: "var(--cr-paper)", position: "relative" }}>

      {/* Header strip */}
      <div style={{ background: "var(--cr-band-bg)", borderBottom: "1px solid rgba(181,101,29,0.15)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "56px 40px 48px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <BarChart3 style={{ width: 16, height: 16, color: "var(--cr-copper)" }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("data.eyebrow")}</span>
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(32px,5vw,52px)", color: "var(--cr-paper)", letterSpacing: "-0.03em", marginBottom: "12px" }}>
            {t("data.title")}
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "var(--cr-ink-4)", maxWidth: "480px", lineHeight: 1.6 }}>
            {t("data.subtitle")}
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 11, color: "var(--cr-ink-4)", marginTop: 6 }}>
            {t("data.sampleNote")}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "20px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Activity style={{ width: 12, height: 12, color: "#4ADE80" }} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-3)" }}>{t("data.live")}</span>
            </div>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-3)" }}>
              <LiveClock />
            </span>
            {data && (
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-3)" }}>
                {t("data.updated", { time: timeAgo(data.lastUpdated) })}
              </span>
            )}
            {data && (
              <button
                onClick={() => exportPlatformCsv(data)}
                style={{ display: "flex", alignItems: "center", gap: "5px", background: "none", border: "none", cursor: "pointer", color: "var(--cr-ink-3)", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", padding: 0 }}
              >
                <Download style={{ width: 11, height: 11 }} />
                {t("data.exportCsv")}
              </button>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: "5px", background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer", color: "var(--cr-copper)", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", opacity: loading ? 0.5 : 1, padding: 0 }}
            >
              <RefreshCw style={{ width: 11, height: 11, animation: loading ? "spin 1s linear infinite" : "none" }} />
              {t("data.refresh")}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 40px 80px" }}>

        {/* Loading skeleton */}
        {loading && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "32px" }}>
              {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: "12px" }}>
              <Loader2 style={{ width: 24, height: 24, color: "var(--cr-copper)", animation: "spin 1s linear infinite" }} />
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)" }}>{t("data.loading")}</p>
            </div>
          </>
        )}

        {/* Error state */}
        {!loading && error && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
            <AlertTriangle style={{ width: 32, height: 32, color: "var(--cr-copper)", marginBottom: "16px" }} />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("data.errorTitle")}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginBottom: "24px" }}>{t("data.errorSub")}</p>
            <button
              onClick={fetchData}
              style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "#fff", border: "none", borderRadius: "4px", padding: "10px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
            >
              <RefreshCw style={{ width: 13, height: 13 }} /> {t("data.retry")}
            </button>
          </div>
        )}

        {/* Empty platform state */}
        {!loading && !error && data && data.startupCount === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
            <Building2 style={{ width: 32, height: 32, color: "var(--cr-ink-4)", marginBottom: "16px" }} />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("data.noData")}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginBottom: "24px" }}>{t("data.beFirstFounders")}</p>
            <Link href="/auth/signup?role=startup" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "#fff", borderRadius: "4px", padding: "10px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}>
              {t("data.listYourStartup")} →
            </Link>
          </div>
        )}

        {/* Data loaded */}
        {!loading && !error && data && data.startupCount > 0 && (
          <>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "32px" }}>
              <StatCard label={t("data.startups")}  value={data.startupCount}  Icon={Building2}   color="var(--cr-copper)" />
              <StatCard label={t("data.investors")} value={data.investorCount} Icon={Users}       color="#3B82F6" />
              <StatCard label={t("data.raised")}    value={data.totalRaised}   prefix="$" Icon={DollarSign} color="var(--cr-up)" />
              <StatCard label={t("data.deals")}     value={data.dealsCount}    Icon={TrendingUp}  color="#B45309" />
            </div>

            {/* ── Growth over time ─────────────────────────────────────────
                Totals say how big the platform is and nothing about whether
                it is growing. Twelve months, empty months included: dropping
                them draws a straight line across the gap, which reads as
                steady activity and is the opposite of what happened. */}
            {monthly.length > 0 && (
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px", marginBottom: "28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Activity style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
                    <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("data.overTime")}</h3>
                  </div>
                  <button onClick={() => setShowTable(v => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "var(--cr-copper)" }}>
                    {showTable ? t("data.showChart") : t("data.showTable")}
                  </button>
                </div>

                {showTable ? (
                  /* Every chart has a table behind it: some of these fills sit
                     below 3:1 against paper, and a reader who cannot separate
                     them still needs the numbers. */
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "420px" }}>
                      <thead>
                        <tr>
                          {[t("data.month"), t("data.newListings"), t("data.dealsClosed"), t("data.capitalSought")].map(h => (
                            <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cr-ink-4)", borderBottom: "1px solid var(--cr-rule-dark)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {monthly.map(m => (
                          <tr key={m.month}>
                            <td style={cellTd}>{m.month}</td>
                            <td style={cellTd}>{m.listings}</td>
                            <td style={cellTd}>{m.closed}</td>
                            <td style={cellTd}>{safeFormatCurrency(m.sought)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <>
                    <LineChart
                      labels={monthly.map(m => monthLabel(m.month))}
                      series={[
                        { key: "listings", label: t("data.newListings"), values: monthly.map(m => m.listings) },
                        { key: "closed", label: t("data.dealsClosed"), values: monthly.map(m => m.closed) },
                      ]}
                    />
                    {/* Capital is a different unit, so it gets its own frame.
                        Two scales on one axis can be made to cross wherever
                        you like, which is the commonest way a chart lies. */}
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--cr-ink-4)", margin: "22px 0 6px" }}>
                      {t("data.capitalSought")}
                    </p>
                    <LineChart
                      height={140}
                      labels={monthly.map(m => monthLabel(m.month))}
                      formatTick={(n) => (n === 0 ? "0" : compactMoney(n))}
                      series={[{ key: "sought", label: t("data.capitalSought"), values: monthly.map(m => m.sought), format: (n) => safeFormatCurrency(n) ?? "—" }]}
                    />
                  </>
                )}
              </div>
            )}

            {/* ── Deal flow ────────────────────────────────────────────────
                The pipeline is the part of this product that isn't a
                directory, and until now it was invisible to anyone who hadn't
                signed in. Aggregate counts only -- the API deliberately sends
                no startup, investor or per-deal amount, because deals are
                private between their two participants. */}
            {data.byDealStage && (
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px", marginBottom: "28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <TrendingUp style={{ width: 13, height: 13, color: "#B45309" }} />
                    <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>
                      {t("data.dealFlow")}
                    </h3>
                  </div>
                  <div style={{ display: "flex", gap: "20px" }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>
                      {t("data.liveDeals")}{" "}
                      <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", color: "var(--cr-ink)" }}>{data.activeDeals}</strong>
                    </span>
                    {data.closeRate != null && (
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>
                        {t("data.closeRate")}{" "}
                        <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", color: "var(--cr-up)" }}>{data.closeRate}%</strong>
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "10px" }}>
                  {DEAL_STAGES.map(({ key, color }) => {
                    const n = data.byDealStage[key] ?? 0;
                    const max = Math.max(...Object.values(data.byDealStage), 1);
                    return (
                      <div key={key} style={{ background: "var(--cr-paper)", border: "1px solid var(--cr-rule)", borderRadius: "4px", padding: "14px 12px" }}>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--cr-ink-4)", marginBottom: "8px" }}>
                          {t(`data.stage_${key}`)}
                        </p>
                        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "22px", lineHeight: 1, color: "var(--cr-ink)", marginBottom: "10px" }}>{n}</p>
                        <div style={{ height: "3px", background: "var(--cr-rule)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ width: `${(n / max) * 100}%`, height: "100%", background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {data.closedCurrencies?.length > 1 && (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "10px", color: "var(--cr-ink-4)", marginTop: "14px" }}>
                    {t("data.multiCurrencyNote", { list: data.closedCurrencies.join(", ") })}
                  </p>
                )}
              </div>
            )}

            {/* Charts */}
            <div className="grid-half-stack" style={{ gap: "20px", marginBottom: "28px" }}>

              {/* Industry breakdown */}
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                  <BarChart3 style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
                  <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("data.industryBreakdown")}</h3>
                </div>
                {industryEntries.length === 0 ? (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", padding: "24px 0", textAlign: "center" }}>{t("data.noDataYet")}</p>
                ) : (
                  /* Share of the whole — the one question a ring answers
                     better than bars. The tail folds into a grey "other"
                     rather than adding unreadable slivers, and every slice
                     carries its percentage so nothing rests on telling two
                     colours apart. */
                  /* The FULL breakdown, not the top six: the ring has to
                     close, and a ring with a gap in it reads as a rendering
                     bug rather than as "the rest". The component folds the
                     tail into a grey "other" itself. */
                  <DonutChart
                    slices={Object.entries(data.byIndustry).map(([label, count]) => ({ key: label, label, value: count }))}
                    otherLabel={t("data.otherIndustries")}
                    hrefFor={(industry) => `/startups?industries=${encodeURIComponent(industry)}`}
                  />
                )}
              </div>

              {/* Stage breakdown */}
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                  <Zap style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
                  <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("data.stageBreakdown")}</h3>
                </div>
                {stageEntries.length === 0 ? (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", padding: "24px 0", textAlign: "center" }}>{t("data.noDataYet")}</p>
                ) : (
                  <BarChart
                    bars={stageEntries.map(([label, count]) => ({
                      key: label, label: STAGE_LABELS[label] ?? label, value: count,
                    }))}
                    hrefFor={(stage) => `/startups?stages=${encodeURIComponent(stage)}`}
                  />
                )}
              </div>
            </div>

            {/* Top startups + Recent */}
            <div className="grid-half-stack" style={{ gap: "20px", marginBottom: "40px" }}>

              {/* Top AI scores */}
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Brain style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
                    <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("data.topAiScores")}</h3>
                  </div>
                  <Link href="/startups" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-copper)", textDecoration: "none" }}>{t("common.viewAll")} →</Link>
                </div>
                {data.topStartups.length === 0 ? (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", textAlign: "center", padding: "24px 0" }}>{t("data.noScoresYet")}</p>
                ) : (
                  data.topStartups.map((s, i) => (
                    <Link key={s.slug} href={`/startups/${s.slug}`} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: i < data.topStartups.length - 1 ? "1px solid var(--cr-rule)" : "none", textDecoration: "none" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "11px", color: "var(--cr-ink-4)", width: "16px", flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ width: 32, height: 32, borderRadius: "4px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "13px", color: "var(--cr-copper)" }}>{s.name[0]}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{s.industry} · {fmtMrr(s.mrr, t("data.preRev"))}</p>
                      </div>
                      <ScorePill score={s.ai_score} />
                    </Link>
                  ))
                )}
              </div>

              {/* Recent listings */}
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Activity style={{ width: 13, height: 13, color: "var(--cr-copper)" }} />
                    <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("data.recentListings")}</h3>
                  </div>
                  <Link href="/startups" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-copper)", textDecoration: "none" }}>{t("common.viewAll")} →</Link>
                </div>
                {data.recentStartups.length === 0 ? (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", textAlign: "center", padding: "24px 0" }}>{t("data.noListingsYet")}</p>
                ) : (
                  data.recentStartups.map((s, i) => (
                    <Link key={s.slug} href={`/startups/${s.slug}`} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: i < data.recentStartups.length - 1 ? "1px solid var(--cr-rule)" : "none", textDecoration: "none" }}>
                      <div style={{ width: 32, height: 32, borderRadius: "4px", background: "var(--cr-paper-3)", border: "1px solid var(--cr-rule-dark)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "13px", color: "var(--cr-ink-3)" }}>{s.name[0]}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: "13px", color: "var(--cr-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "11px", color: "var(--cr-ink-4)" }}>{s.industry} · {STAGE_LABELS[s.stage] ?? s.stage}</p>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "12px", color: "var(--cr-ink)" }}>{fmtRaising(s.funding_target)}</p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "10px", color: "var(--cr-ink-4)" }}>{timeAgo(s.created_at)}</p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* CTA */}
            <div style={{ background: "var(--cr-band-bg)", borderRadius: "4px", padding: "48px 40px", textAlign: "center" }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "28px", color: "var(--cr-paper)", marginBottom: "8px" }}>{t("data.featuredHere")}</h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "var(--cr-ink-4)", marginBottom: "28px", maxWidth: "380px", margin: "0 auto 28px" }}>
                {t("data.featuredHereSub")}
              </p>
              <Link href="/auth/signup?role=startup" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "var(--cr-copper)", color: "#fff", borderRadius: "4px", padding: "12px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}>
                {t("data.listFree")} →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
