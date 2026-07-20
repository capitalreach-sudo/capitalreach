"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  TrendingUp, BarChart3, Users, DollarSign,
  Zap, Activity, Building2, Brain,
  Loader2, RefreshCw, AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { LiveClock } from "@/components/ui/LiveClock";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TopStartup {
  name: string;
  slug: string;
  industry: string;
  stage: string;
  mrr: number | null;
  ai_score: number | null;
  funding_target: number;
  created_at: string;
}

interface PlatformData {
  startupCount: number;
  investorCount: number;
  totalRaised: number;
  dealsCount: number;
  byIndustry: Record<string, number>;
  byStage: Record<string, number>;
  topStartups: TopStartup[];
  recentStartups: TopStartup[];
  lastUpdated: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed:     "Seed",
  series_a: "Series A",
  series_b: "Series B+",
};

function fmtMrr(n: number | null, preRevLabel = "Pre-rev") {
  if (!n) return preRevLabel;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtRaising(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${(n / 1000).toFixed(0)}K`;
}

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

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
        style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "32px", color: "var(--cr-ink)", lineHeight: 1 }}
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

function BarRow({ label, count, maxCount, animate }: {
  label: string; count: number; maxCount: number; animate: boolean;
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "10px 0", borderBottom: "1px solid var(--cr-rule)" }}>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, fontSize: "13px", color: "#3D3630", width: "120px", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ flex: 1, background: "#E4DDD2", height: "3px", borderRadius: "9999px", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          background: "#B5651D",
          borderRadius: "9999px",
          width: animate ? `${pct}%` : "0%",
          transition: "width 800ms cubic-bezier(.16,1,.3,1)",
        }} />
      </div>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px", color: "#B5651D", width: "28px", textAlign: "right" }}>
        {count}
      </span>
    </div>
  );
}

// ── Score pill ────────────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number | null }) {
  if (!score) return <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "var(--cr-ink-4)" }}>—</span>;
  const color = score >= 80 ? "#2D6A4F" : score >= 60 ? "#B5651D" : score >= 40 ? "#B45309" : "#B91C1C";
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

export function DataCentre() {
  const { t } = useTranslation();
  const [data, setData] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [barsVisible, setBarsVisible] = useState(false);
  const barsRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    setBarsVisible(false);
    try {
      const res = await fetch("/api/platform-data");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setData(json);
      // Trigger bar animations after a short delay
      setTimeout(() => setBarsVisible(true), 120);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Intersection Observer to trigger bars when in viewport
  useEffect(() => {
    if (!barsRef.current || loading || !data) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setBarsVisible(true); obs.disconnect(); }
    }, { threshold: 0.2 });
    obs.observe(barsRef.current);
    return () => obs.disconnect();
  }, [loading, data]);

  const industryEntries = data
    ? Object.entries(data.byIndustry).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];
  const stageEntries = data
    ? Object.entries(data.byStage).sort((a, b) => b[1] - a[1])
    : [];
  const industryMax = industryEntries[0]?.[1] ?? 1;
  const stageMax = stageEntries[0]?.[1] ?? 1;

  return (
    <div className="data-page-bg" style={{ minHeight: "100vh", background: "var(--cr-paper)", position: "relative" }}>

      {/* Header strip */}
      <div style={{ background: "#1A1612", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "56px 40px 48px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <BarChart3 style={{ width: 16, height: 16, color: "#B5651D" }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "11px", color: "#B5651D", textTransform: "uppercase", letterSpacing: "0.1em" }}>{t("data.eyebrow")}</span>
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "clamp(32px,5vw,52px)", color: "#F5F0E8", letterSpacing: "-0.03em", marginBottom: "12px" }}>
            {t("data.title")}
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "15px", color: "#9C8E82", maxWidth: "480px", lineHeight: 1.6 }}>
            {t("data.subtitle")}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "20px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Activity style={{ width: 12, height: 12, color: "#4ADE80" }} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#6B6056" }}>{t("data.live")}</span>
            </div>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#6B6056" }}>
              <LiveClock />
            </span>
            {data && (
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#6B6056" }}>
                {t("data.updated", { time: timeAgo(data.lastUpdated) })}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: "5px", background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer", color: "#B5651D", fontFamily: "'DM Sans', sans-serif", fontSize: "11px", opacity: loading ? 0.5 : 1, padding: 0 }}
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
              <Loader2 style={{ width: 24, height: 24, color: "#B5651D", animation: "spin 1s linear infinite" }} />
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)" }}>{t("data.loading")}</p>
            </div>
          </>
        )}

        {/* Error state */}
        {!loading && error && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
            <AlertTriangle style={{ width: 32, height: 32, color: "#B5651D", marginBottom: "16px" }} />
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "15px", color: "var(--cr-ink)", marginBottom: "6px" }}>{t("data.errorTitle")}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "13px", color: "var(--cr-ink-4)", marginBottom: "24px" }}>{t("data.errorSub")}</p>
            <button
              onClick={fetchData}
              style={{ display: "flex", alignItems: "center", gap: "8px", background: "#B5651D", color: "#fff", border: "none", borderRadius: "4px", padding: "10px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}
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
            <Link href="/auth/signup?role=startup" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#B5651D", color: "#fff", borderRadius: "4px", padding: "10px 20px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}>
              {t("data.listYourStartup")} →
            </Link>
          </div>
        )}

        {/* Data loaded */}
        {!loading && !error && data && data.startupCount > 0 && (
          <>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "32px" }}>
              <StatCard label={t("data.startups")}  value={data.startupCount}  Icon={Building2}   color="#B5651D" />
              <StatCard label={t("data.investors")} value={data.investorCount} Icon={Users}       color="#3B82F6" />
              <StatCard label={t("data.raised")}    value={data.totalRaised}   prefix="$" Icon={DollarSign} color="#2D6A4F" />
              <StatCard label={t("data.deals")}     value={data.dealsCount}    Icon={TrendingUp}  color="#B45309" />
            </div>

            {/* Charts */}
            <div ref={barsRef} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "28px" }}>

              {/* Industry breakdown */}
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                  <BarChart3 style={{ width: 13, height: 13, color: "#B5651D" }} />
                  <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("data.industryBreakdown")}</h3>
                </div>
                {industryEntries.length === 0 ? (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", padding: "24px 0", textAlign: "center" }}>{t("data.noDataYet")}</p>
                ) : (
                  industryEntries.map(([label, count]) => (
                    <BarRow key={label} label={label} count={count} maxCount={industryMax} animate={barsVisible} />
                  ))
                )}
              </div>

              {/* Stage breakdown */}
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                  <Zap style={{ width: 13, height: 13, color: "#B5651D" }} />
                  <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("data.stageBreakdown")}</h3>
                </div>
                {stageEntries.length === 0 ? (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", padding: "24px 0", textAlign: "center" }}>{t("data.noDataYet")}</p>
                ) : (
                  stageEntries.map(([label, count]) => (
                    <BarRow key={label} label={STAGE_LABELS[label] ?? label} count={count} maxCount={stageMax} animate={barsVisible} />
                  ))
                )}
              </div>
            </div>

            {/* Top startups + Recent */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "40px" }}>

              {/* Top AI scores */}
              <div style={{ background: "var(--cr-paper-2)", border: "1px solid var(--cr-rule-dark)", borderRadius: "4px", padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Brain style={{ width: 13, height: 13, color: "#B5651D" }} />
                    <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("data.topAiScores")}</h3>
                  </div>
                  <Link href="/startups" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#B5651D", textDecoration: "none" }}>{t("common.viewAll")} →</Link>
                </div>
                {data.topStartups.length === 0 ? (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "var(--cr-ink-4)", textAlign: "center", padding: "24px 0" }}>{t("data.noScoresYet")}</p>
                ) : (
                  data.topStartups.map((s, i) => (
                    <Link key={s.slug} href={`/startups/${s.slug}`} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: i < data.topStartups.length - 1 ? "1px solid var(--cr-rule)" : "none", textDecoration: "none" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: "11px", color: "var(--cr-ink-4)", width: "16px", flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ width: 32, height: 32, borderRadius: "4px", background: "var(--cr-copper-bg)", border: "1px solid var(--cr-copper-br)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "13px", color: "#B5651D" }}>{s.name[0]}</span>
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
                    <Activity style={{ width: 13, height: 13, color: "#B5651D" }} />
                    <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", color: "var(--cr-ink)" }}>{t("data.recentListings")}</h3>
                  </div>
                  <Link href="/startups" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", color: "#B5651D", textDecoration: "none" }}>{t("common.viewAll")} →</Link>
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
            <div style={{ background: "#1A1612", borderRadius: "4px", padding: "48px 40px", textAlign: "center" }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 700, fontSize: "28px", color: "#F5F0E8", marginBottom: "8px" }}>{t("data.featuredHere")}</h2>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "14px", color: "#9C8E82", marginBottom: "28px", maxWidth: "380px", margin: "0 auto 28px" }}>
                {t("data.featuredHereSub")}
              </p>
              <Link href="/auth/signup?role=startup" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#B5651D", color: "#fff", borderRadius: "4px", padding: "12px 24px", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}>
                {t("data.listFree")} →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
