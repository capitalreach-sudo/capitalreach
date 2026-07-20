"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  Search, SlidersHorizontal, X, ChevronDown, ChevronUp,
  Users, Globe, Filter, Loader2,
} from "lucide-react";
import { INDUSTRIES, STAGES } from "@/types";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";

const TYPE_META: Record<string, { labelKey: string; color: string; bg: string; border: string }> = {
  angel:         { labelKey: "investors.typeAngel",        color: "text-blue-300",   bg: "bg-blue-500/10",   border: "border-blue-500/30"   },
  vc:            { labelKey: "investors.typeVc",           color: "text-cr-cu-l",  bg: "bg-cr-copper/10",  border: "border-cr-copper/30"  },
  family_office: { labelKey: "investors.typeFamilyOffice", color: "text-amber-300",  bg: "bg-amber-500/10",  border: "border-amber-500/30"  },
  corporate:     { labelKey: "investors.typeCorporate",    color: "text-rose-300",   bg: "bg-rose-500/10",   border: "border-rose-500/30"   },
};

const STAGE_LABELS: Record<string, string> = {
  pre_seed: "Pre-Seed", seed: "Seed", series_a: "Series A", series_b: "Series B",
};

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

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between py-1 mb-2 group">
        <p className="text-xs font-bold text-cr-i4 uppercase tracking-wide group-hover:text-cr-i2 transition-colors">{title}</p>
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
  leadOnly: boolean;
  sort: "recent" | "check_asc" | "check_desc";
}

const DEFAULT: InvestorFilters = {
  query: "", types: [], industries: [], stages: [],
  minCheck: 0, maxCheck: 100_000_000, leadOnly: false, sort: "recent",
};

export function InvestorsClient() {
  const { t } = useTranslation();
  const [f, setF] = useState<InvestorFilters>(DEFAULT);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);

  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    async function fetchInvestors() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("investors")
          .select(`
            id, slug, type, bio, industries, stages, min_check, max_check, geography, subscription_tier,
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
  }, []);

  function toggle<K extends "types" | "industries" | "stages">(key: K, val: string) {
    const arr = f[key] as string[];
    setF(prev => ({ ...prev, [key]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] }));
  }

  const activeCount =
    f.types.length + f.industries.length + f.stages.length +
    (f.minCheck > 0 ? 1 : 0) + (f.maxCheck < 100_000_000 ? 1 : 0);

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
      const minCheckOk = !inv.max_check || inv.max_check >= f.minCheck;
      const maxCheckOk = !inv.min_check || inv.min_check <= f.maxCheck;
      return matchQ && matchType && matchInd && matchStage && minCheckOk && maxCheckOk;
    });

    if (f.sort === "check_desc") list = [...list].sort((a, b) => (b.max_check || 0) - (a.max_check || 0));
    else if (f.sort === "check_asc") list = [...list].sort((a, b) => (a.min_check || 0) - (b.min_check || 0));

    return list;
  }, [f, investors]);

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
          ] as const).map(([val, label]) => (
            <button key={val} onClick={() => setF(p => ({ ...p, sort: val }))}
              className={cn("w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors",
                f.sort === val ? "bg-cr-copper/15 text-cr-cu-l font-semibold" : "text-cr-i2 hover:bg-cr-p2")}
            >{label}</button>
          ))}
        </div>
      </Section>

      <div className="h-px bg-border-dark" />

      {/* Investor type */}
      <Section title={t("investors.investorType")}>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(TYPE_META).map(([val, meta]) => (
            <button key={val} onClick={() => toggle("types", val)}
              className={cn("text-xs font-medium px-2.5 py-1 rounded-full border transition-all",
                f.types.includes(val)
                  ? `${meta.bg} ${meta.color} ${meta.border} font-bold`
                  : "border-cr-p4 text-cr-i4 hover:border-cr-i4 hover:text-cr-i2"
              )}
            >{t(meta.labelKey)}</button>
          ))}
        </div>
      </Section>

      <div className="h-px bg-border-dark" />

      {/* Check size */}
      <Section title={t("investors.checkSizeRange")}>
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
        </div>
      </Section>

      <div className="h-px bg-border-dark" />

      {/* Stages */}
      <Section title={t("investors.investmentStage")}>
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
      <Section title={t("investors.focusIndustries")} defaultOpen={false}>
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
                value={f.query}
                onChange={e => setF(p => ({ ...p, query: e.target.value }))}
                placeholder={t("investors.searchPlaceholder")}
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-cr-p4 bg-cr-paper text-cr-ink text-sm placeholder:text-cr-i4 focus:outline-none focus:ring-2 focus:ring-cr-copper/40 focus:border-cr-copper/50"
              />
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
                </p>
                {activeCount > 0 && (
                  <button onClick={() => setF(DEFAULT)} className="text-xs text-cr-copper hover:underline font-medium flex items-center gap-1">
                    <X className="h-3 w-3" /> {t("investors.clearFilters")}
                  </button>
                )}
              </div>

              {/* Investor grid */}
              {results.length === 0 ? (
                <div className="text-center py-20 text-cr-i4">
                  <Users className="h-10 w-10 mx-auto mb-3 text-cr-i4/40" />
                  <p className="font-medium text-cr-i3">{t("investors.noMatch")}</p>
                  <p className="text-sm mt-1">{t("investors.noMatchSub")}</p>
                  <button onClick={() => setF(DEFAULT)} className="mt-4 text-sm text-cr-copper hover:underline font-medium">
                    {t("investors.clearAllFilters")}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {results.map((inv, idx) => {
                    const meta = TYPE_META[inv.type] ?? TYPE_META.angel;
                    const grad = GRAD_COLORS[idx % GRAD_COLORS.length];
                    const displayName = inv.full_name || t("investors.anonymousInvestor");
                    return (
                      <div key={inv.id} className="group bg-cr-paper border border-cr-p4 rounded-2xl p-5 hover:border-cr-copper/30 hover:shadow-[0_0_20px_rgba(196,158,80,0.1)] transition-all duration-200 flex flex-col">
                        {/* Top */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center font-extrabold text-white text-lg flex-shrink-0 shadow-md`}>
                              {displayName[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-cr-ink text-sm leading-tight group-hover:text-cr-copper transition-colors">{displayName}</p>
                              {inv.firm && <p className="text-xs text-cr-i4 mt-0.5">{inv.firm}</p>}
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", meta.bg, meta.color, meta.border)}>
                                  {t(meta.labelKey)}
                                </span>
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
                          <div className="bg-cr-p2 rounded-xl px-3 py-2 mb-3 border border-cr-p4">
                            <p className="text-[10px] text-cr-i4 font-medium mb-0.5">{t("investors.checkSize")}</p>
                            <p className="text-xs font-bold text-cr-ink">
                              {inv.min_check ? formatCheck(inv.min_check) : t("investors.any")} – {inv.max_check ? formatCheck(inv.max_check) : t("investors.any")}
                            </p>
                          </div>
                        )}

                        {/* Stages */}
                        {inv.stages && inv.stages.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {inv.stages.map(s => (
                              <span key={s} className="text-[10px] font-medium px-2 py-0.5 bg-cr-copper/10 text-cr-copper border border-cr-copper/20 rounded-full">
                                {STAGE_LABELS[s] ?? s}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Industries */}
                        {inv.industries && inv.industries.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {inv.industries.slice(0, 3).map(ind => (
                              <span key={ind} className="text-[10px] font-medium px-2 py-0.5 bg-cr-p2 text-cr-i4 border border-cr-p4 rounded-full">{ind}</span>
                            ))}
                            {inv.industries.length > 3 && (
                              <span className="text-[10px] font-medium px-2 py-0.5 bg-cr-p2 text-cr-i4 border border-cr-p4 rounded-full">+{inv.industries.length - 3}</span>
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
            <div className="mt-16 bg-gradient-to-r from-cr-cu-d to-emerald-700 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-5 text-white">
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
