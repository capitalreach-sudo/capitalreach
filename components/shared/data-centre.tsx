"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import {
  TrendingUp, BarChart3, Users, DollarSign, Zap, ArrowUpRight,
  Clock, CheckCircle2, Activity, Globe, Building2, Brain,
  Loader2, RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface PlatformStats {
  startupCount: number;
  investorCount: number;
  activeListings: number;
  aiScoresGenerated: number;
}

interface IndustryCount {
  industry: string;
  count: number;
}

interface StageCount {
  stage: string;
  count: number;
}

interface RecentStartup {
  id: string;
  slug: string;
  name: string;
  industry: string;
  stage: string;
  funding_target: number;
  mrr: number | null;
  vaultrise_score: number | null;
  created_at: string;
  featured: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B+",
};

const INDUSTRY_COLORS: Record<string, string> = {
  "FinTech": "bg-blue-500",
  "HealthTech": "bg-emerald-500",
  "Deep Tech / AI": "bg-purple-600",
  "EdTech": "bg-amber-500",
  "Climate / CleanTech": "bg-teal-500",
  "B2B SaaS": "bg-slate-500",
  "AgriTech": "bg-lime-500",
  "PropTech": "bg-orange-500",
  "Logistics / Supply Chain": "bg-cyan-500",
  "Consumer": "bg-pink-500",
};

const STAGE_COLORS: Record<string, string> = {
  pre_seed: "#818cf8",
  seed: "#22c55e",
  series_a: "#f59e0b",
  series_b: "#f43f5e",
};

function formatMrr(n: number | null) {
  if (!n || n === 0) return "Pre-rev";
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

function formatFunding(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${(n / 1000).toFixed(0)}K`;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function HorizontalBar({ label, pct, count, color }: { label: string; pct: number; count: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-sm text-cr-i2 font-medium flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-6 bg-cr-p3 rounded-full overflow-hidden relative">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
        <span className="absolute inset-0 flex items-center pl-3 text-[11px] font-bold text-white mix-blend-luminosity">
          {count} startup{count !== 1 ? "s" : ""}
        </span>
      </div>
      <span className="w-10 text-right text-sm font-bold text-cr-i2">{pct}%</span>
    </div>
  );
}

function ScorePill({ score }: { score: number | null }) {
  if (!score) return <span className="text-xs text-cr-i4">N/A</span>;
  const color = score >= 80
    ? "bg-emerald-900/50 text-emerald-400 border border-emerald-700/50"
    : score >= 60
    ? "bg-cr-ink/50 text-cr-cu-l border border-cr-cu-d/50"
    : score >= 40
    ? "bg-amber-900/50 text-amber-400 border border-amber-700/50"
    : "bg-red-900/50 text-red-400 border border-red-700/50";
  return <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", color)}>⚡{score}</span>;
}

export function DataCentre() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [industries, setIndustries] = useState<IndustryCount[]>([]);
  const [stages, setStages] = useState<StageCount[]>([]);
  const [recentStartups, setRecentStartups] = useState<RecentStartup[]>([]);
  const [topStartups, setTopStartups] = useState<RecentStartup[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  async function fetchData() {
    setLoading(true);
    try {
      const [
        { count: startupCount },
        { count: investorCount },
        { count: activeCount },
        { count: aiScoreCount },
        { data: startupData },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "startup"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "investor"),
        supabase.from("startups").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("startups").select("*", { count: "exact", head: true }).not("vaultrise_score", "is", null),
        supabase
          .from("startups")
          .select("id, slug, name, industry, stage, funding_target, mrr, vaultrise_score, created_at, featured")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      setStats({
        startupCount: startupCount ?? 0,
        investorCount: investorCount ?? 0,
        activeListings: activeCount ?? 0,
        aiScoresGenerated: aiScoreCount ?? 0,
      });

      const allStartups = (startupData as RecentStartup[]) || [];

      // Compute industry breakdown
      const indMap: Record<string, number> = {};
      allStartups.forEach(s => { indMap[s.industry] = (indMap[s.industry] || 0) + 1; });
      const total = allStartups.length || 1;
      const indList = Object.entries(indMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([industry, count]) => ({ industry, count }));
      setIndustries(indList);

      // Compute stage breakdown
      const stageMap: Record<string, number> = {};
      allStartups.forEach(s => { stageMap[s.stage] = (stageMap[s.stage] || 0) + 1; });
      const stageList = Object.entries(stageMap)
        .sort((a, b) => b[1] - a[1])
        .map(([stage, count]) => ({ stage, count }));
      setStages(stageList);

      // Recent 5
      setRecentStartups(allStartups.slice(0, 5));

      // Top by AI score
      const scored = [...allStartups].filter(s => s.vaultrise_score != null);
      scored.sort((a, b) => (b.vaultrise_score || 0) - (a.vaultrise_score || 0));
      setTopStartups(scored.slice(0, 5));

      setLastRefreshed(new Date());
    } catch (err) {
      // DB not connected — leave stats as null
    }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const totalStartups = industries.reduce((s, i) => s + i.count, 0) || 1;

  return (
    <div className="min-h-screen bg-cr-p2/40">
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#0F0C0A] via-[#1A1612] to-slate-900 text-white py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-5 w-5 text-cr-cu-l" />
            <span className="text-sm font-semibold text-cr-cu-l uppercase tracking-wide">Live Platform Data</span>
          </div>
          <h1 className="text-4xl font-extrabold mb-3">Data Centre</h1>
          <p className="text-cr-i4 text-lg max-w-xl">
            Real-time platform analytics — startup counts, funding activity, industry breakdown, and top-performing listings.
          </p>
          <div className="flex items-center gap-2 mt-4 text-xs text-cr-i4">
            <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
            <span>Live data</span>
            <span className="mx-1">·</span>
            <span>Last refreshed: {lastRefreshed?.toLocaleTimeString() ?? "Loading…"}</span>
            <button
              onClick={fetchData}
              disabled={loading}
              className="ml-2 flex items-center gap-1 text-cr-cu-l hover:text-white transition-colors"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-cr-i4">
            <Loader2 className="h-8 w-8 animate-spin text-cr-copper" />
            <p className="text-sm">Loading platform data…</p>
          </div>
        ) : stats === null ? (
          /* DB not connected */
          <div className="text-center py-24 bg-cr-paper rounded-2xl border border-cr-p4">
            <BarChart3 className="h-12 w-12 text-cr-i4 mx-auto mb-4" />
            <p className="font-bold text-cr-i2 text-lg mb-2">No data available yet</p>
            <p className="text-sm text-cr-i3 max-w-xs mx-auto mb-6">
              Connect your Supabase database to start tracking real platform analytics.
            </p>
            <Link href="/auth/signup" className="inline-flex items-center gap-2 bg-cr-cu-d text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-cr-cu-l transition-colors">
              Join the platform →
            </Link>
          </div>
        ) : (
          <>
            {/* Platform stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Listed Startups", value: stats.activeListings.toString(), icon: Building2, color: "text-cr-copper", bg: "bg-cr-copper/10", border: "border-cr-copper/20" },
                { label: "Registered Investors", value: stats.investorCount.toString(), icon: Users, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
                { label: "Total Founders", value: stats.startupCount.toString(), icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
                { label: "Industries Covered", value: industries.length.toString(), icon: Globe, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
              ].map(s => (
                <div key={s.label} className={`bg-cr-paper rounded-2xl border ${s.border} p-5 flex flex-col gap-3`}>
                  <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center`}>
                    <s.icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-cr-ink">{s.value}</p>
                    <p className="text-xs text-cr-i3 mt-0.5">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Industry breakdown */}
              <div className="bg-cr-paper rounded-2xl border border-cr-p4 p-6">
                <h3 className="font-bold text-cr-ink mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-cr-copper" /> Startups by Industry
                </h3>
                {industries.length === 0 ? (
                  <p className="text-sm text-cr-i4 py-8 text-center">No startups listed yet</p>
                ) : (
                  <div className="space-y-3">
                    {industries.map(ind => (
                      <HorizontalBar
                        key={ind.industry}
                        label={ind.industry}
                        count={ind.count}
                        pct={Math.round((ind.count / totalStartups) * 100)}
                        color={INDUSTRY_COLORS[ind.industry] || "bg-gray-400"}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Stage breakdown */}
              <div className="bg-cr-paper rounded-2xl border border-cr-p4 p-6">
                <h3 className="font-bold text-cr-ink mb-4 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" /> Startups by Stage
                </h3>
                {stages.length === 0 ? (
                  <p className="text-sm text-cr-i4 py-8 text-center">No startups listed yet</p>
                ) : (
                  <>
                    {/* Donut-style visual */}
                    <div className="flex gap-4 mb-5">
                      <div className="relative w-28 h-28 flex-shrink-0">
                        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                          {(() => {
                            let offset = 0;
                            const total = stages.reduce((s, x) => s + x.count, 0);
                            return stages.map(s => {
                              const pct = (s.count / total) * 100;
                              const el = (
                                <circle
                                  key={s.stage}
                                  cx="18" cy="18" r="15.915"
                                  fill="none"
                                  stroke={STAGE_COLORS[s.stage] || "#94a3b8"}
                                  strokeWidth="3"
                                  strokeDasharray={`${pct} ${100 - pct}`}
                                  strokeDashoffset={`${-offset}`}
                                />
                              );
                              offset += pct;
                              return el;
                            });
                          })()}
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-lg font-extrabold text-cr-ink">{stages.reduce((s, x) => s + x.count, 0)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col justify-center gap-2">
                        {stages.map(s => {
                          const total = stages.reduce((a, x) => a + x.count, 0);
                          const pct = Math.round((s.count / total) * 100);
                          return (
                            <div key={s.stage} className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STAGE_COLORS[s.stage] || "#94a3b8" }} />
                              <span className="text-sm text-cr-i2">{STAGE_LABELS[s.stage] || s.stage}</span>
                              <span className="text-sm font-bold text-cr-ink ml-auto">{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Bottom row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Recent listings */}
              <div className="bg-cr-paper rounded-2xl border border-cr-p4 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-cr-ink flex items-center gap-2">
                    <Activity className="h-4 w-4 text-emerald-500" /> Recent Listings
                  </h3>
                  <Link href="/startups" className="text-xs text-cr-copper hover:underline font-medium">View all →</Link>
                </div>
                {recentStartups.length === 0 ? (
                  <div className="text-center py-10">
                    <Building2 className="h-8 w-8 text-cr-i4 mx-auto mb-2" />
                    <p className="text-sm text-cr-i4">No startups listed yet</p>
                    <Link href="/auth/signup?role=startup" className="text-xs text-cr-copper hover:underline mt-1 block font-medium">
                      Be the first to list →
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentStartups.map(s => (
                      <Link key={s.id} href={`/startups/${s.slug}`} className="flex items-center gap-3 hover:bg-cr-p2 -mx-2 px-2 py-1.5 rounded-xl transition-colors group">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cr-cu-l to-brand-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {s.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-cr-ink text-sm truncate group-hover:text-cr-cu-l transition-colors">{s.name}</p>
                          <p className="text-xs text-cr-i4">{s.industry} · {STAGE_LABELS[s.stage] || s.stage}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold text-cr-ink">{formatFunding(s.funding_target)}</p>
                          <p className="text-[10px] text-cr-i4">{timeAgo(s.created_at)}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Top AI scores */}
              <div className="bg-cr-paper rounded-2xl border border-cr-p4 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-cr-ink flex items-center gap-2">
                    <Brain className="h-4 w-4 text-cr-copper" /> Top AI Scores
                  </h3>
                  <Link href="/startups?sort=score" className="text-xs text-cr-copper hover:underline font-medium">View all →</Link>
                </div>
                {topStartups.length === 0 ? (
                  <div className="text-center py-10">
                    <Brain className="h-8 w-8 text-cr-i4 mx-auto mb-2" />
                    <p className="text-sm text-cr-i4">No AI scores generated yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topStartups.map((s, i) => (
                      <Link key={s.id} href={`/startups/${s.slug}`} className="flex items-center gap-3 hover:bg-cr-p2 -mx-2 px-2 py-1.5 rounded-xl transition-colors group">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0",
                          i === 0 ? "bg-amber-400 text-white" : i === 1 ? "bg-gray-300 text-cr-i2" : i === 2 ? "bg-amber-700 text-white" : "bg-cr-p3 text-cr-i3"
                        )}>
                          {i + 1}
                        </div>
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cr-cu-l to-brand-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {s.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-cr-ink text-sm truncate group-hover:text-cr-cu-l transition-colors">{s.name}</p>
                          <p className="text-xs text-cr-i4">{s.industry} · {formatMrr(s.mrr)}</p>
                        </div>
                        <ScorePill score={s.vaultrise_score} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* CTA */}
            <div className="mt-10 text-center bg-gradient-to-br from-[#0F0C0A] to-slate-900 rounded-2xl p-10 text-white">
              <h2 className="text-2xl font-bold mb-2">Want your startup featured here?</h2>
              <p className="text-cr-i4 mb-6 max-w-md mx-auto">List your startup on CapitalReach to appear in our data charts and get discovered by investors.</p>
              <Link href="/auth/signup?role=startup" className="inline-flex items-center gap-2 bg-cr-copper hover:bg-cr-cu-l text-white font-semibold px-6 py-3 rounded-xl transition-colors">
                List Your Startup Free →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
