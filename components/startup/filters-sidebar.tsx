"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { INDUSTRIES, STAGES } from "@/types";
import { SlidersHorizontal, X, ChevronDown, ChevronUp, Brain, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterState {
  industries: string[];
  stages: string[];
  fundingMin: number;
  fundingMax: number;
  mrrMin: number;
  mrrMax: number;
  country: string;
  sort: "recent" | "views" | "saved" | "score";
  aiScoreMin: number;
  businessModels: string[];
  revenueStatus: "all" | "pre_revenue" | "has_revenue";
  featuredOnly: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  industries: [],
  stages: [],
  fundingMin: 0,
  fundingMax: 10_000_000,
  mrrMin: 0,
  mrrMax: 500_000,
  country: "",
  sort: "recent",
  aiScoreMin: 0,
  businessModels: [],
  revenueStatus: "all",
  featuredOnly: false,
};

const BUSINESS_MODELS = ["B2B", "B2C", "B2B2C", "Marketplace", "Platform", "D2C"];

interface FiltersSidebarProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-1 mb-2 group"
      >
        <p className="text-xs font-bold text-cr-i3 uppercase tracking-wide group-hover:text-cr-i2 transition-colors">{title}</p>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-cr-i4" /> : <ChevronDown className="h-3.5 w-3.5 text-cr-i4" />}
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </div>
  );
}

export function FiltersSidebar({ filters, onChange }: FiltersSidebarProps) {
  function toggle<K extends "industries" | "stages" | "businessModels">(key: K, value: string) {
    const arr = filters[key] as string[];
    onChange({ ...filters, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] });
  }

  function reset() { onChange(DEFAULT_FILTERS); }

  const activeCount =
    filters.industries.length +
    filters.stages.length +
    filters.businessModels.length +
    (filters.fundingMin > 0 || filters.fundingMax < 10_000_000 ? 1 : 0) +
    (filters.mrrMin > 0 || filters.mrrMax < 500_000 ? 1 : 0) +
    (filters.aiScoreMin > 0 ? 1 : 0) +
    (filters.revenueStatus !== "all" ? 1 : 0) +
    (filters.featuredOnly ? 1 : 0) +
    (filters.country ? 1 : 0);

  return (
    <aside className="w-64 flex-shrink-0 hidden lg:block">
      <div className="sticky top-24 bg-cr-paper rounded-2xl border border-cr-p4 shadow-sm p-5 space-y-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-cr-ink">
            <SlidersHorizontal className="h-4 w-4 text-cr-copper" />
            Filters
            {activeCount > 0 && (
              <span className="ml-1 text-[10px] font-bold bg-cr-cu-d text-white px-1.5 py-0.5 rounded-full">
                {activeCount}
              </span>
            )}
          </div>
          {activeCount > 0 && (
            <button onClick={reset} className="text-xs text-cr-copper hover:text-cr-cu-l flex items-center gap-1 font-medium">
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>

        <Separator />

        {/* Sort */}
        <Section title="Sort By">
          {([
            ["recent", "Recently Added"],
            ["score", "Highest AI Score"],
            ["views", "Most Viewed"],
            ["saved", "Most Saved"],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => onChange({ ...filters, sort: val })}
              className={cn(
                "w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors",
                filters.sort === val ? "bg-cr-copper/15 text-cr-cu-l font-semibold" : "text-cr-i3 hover:bg-cr-p2"
              )}
            >
              {val === "score" && <Brain className="inline h-3 w-3 mr-1.5 text-cr-copper" />}
              {label}
            </button>
          ))}
        </Section>

        <Separator />

        {/* Quick toggles */}
        <Section title="Quick Filters">
          <label className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 cursor-pointer transition-all",
            filters.featuredOnly ? "border-amber-400 bg-amber-500/10" : "border-cr-p4 hover:border-cr-p4"
          )}>
            <Checkbox
              checked={filters.featuredOnly}
              onCheckedChange={v => onChange({ ...filters, featuredOnly: !!v })}
            />
            <span className="text-sm font-medium text-cr-ink">⭐ Featured only</span>
          </label>
          <div className="flex gap-2">
            {(["all", "pre_revenue", "has_revenue"] as const).map(v => (
              <button
                key={v}
                onClick={() => onChange({ ...filters, revenueStatus: v })}
                className={cn(
                  "flex-1 text-[11px] font-medium py-1.5 rounded-lg border transition-all",
                  filters.revenueStatus === v ? "bg-cr-cu-d text-white border-cr-cu-d" : "border-cr-p4 text-cr-i3 hover:border-cr-i4"
                )}
              >
                {v === "all" ? "All" : v === "has_revenue" ? "Revenue" : "Pre-Rev"}
              </button>
            ))}
          </div>
        </Section>

        <Separator />

        {/* AI Score */}
        <Section title="Min AI Score">
          <div className="px-1 pt-1">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-cr-copper" />
                <span className="text-xs text-cr-i3">Minimum score</span>
              </div>
              <span className={cn(
                "text-sm font-extrabold px-2 py-0.5 rounded-lg",
                filters.aiScoreMin >= 90 ? "text-emerald-400 bg-emerald-500/10" :
                filters.aiScoreMin >= 70 ? "text-amber-400 bg-amber-500/10" :
                "text-cr-i2 bg-cr-p3"
              )}>
                {filters.aiScoreMin > 0 ? `${filters.aiScoreMin}+` : "Any"}
              </span>
            </div>
            <Slider
              min={0} max={95} step={5}
              value={[filters.aiScoreMin]}
              onValueChange={([v]) => onChange({ ...filters, aiScoreMin: v })}
            />
            <div className="flex justify-between text-[10px] text-cr-i4 mt-1.5">
              <span>0</span><span>50</span><span>95+</span>
            </div>
          </div>
        </Section>

        <Separator />

        {/* Stage */}
        <Section title="Stage">
          {STAGES.map(s => (
            <label key={s.value} className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
              filters.stages.includes(s.value) ? "bg-cr-copper/10 text-cr-cu-l" : "hover:bg-cr-p2"
            )}>
              <Checkbox
                id={`stage-${s.value}`}
                checked={filters.stages.includes(s.value)}
                onCheckedChange={() => toggle("stages", s.value)}
              />
              <Label htmlFor={`stage-${s.value}`} className="text-sm font-normal cursor-pointer mb-0">{s.label}</Label>
            </label>
          ))}
        </Section>

        <Separator />

        {/* Industry */}
        <Section title="Industry">
          <div className="max-h-44 overflow-y-auto space-y-0.5 pr-1">
            {INDUSTRIES.map(ind => (
              <label key={ind} className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
                filters.industries.includes(ind) ? "bg-cr-copper/10 text-cr-cu-l" : "hover:bg-cr-p2"
              )}>
                <Checkbox
                  id={`ind-${ind}`}
                  checked={filters.industries.includes(ind)}
                  onCheckedChange={() => toggle("industries", ind)}
                />
                <Label htmlFor={`ind-${ind}`} className="text-sm font-normal cursor-pointer mb-0 leading-tight">{ind}</Label>
              </label>
            ))}
          </div>
        </Section>

        <Separator />

        {/* Business Model */}
        <Section title="Business Model" defaultOpen={false}>
          <div className="flex flex-wrap gap-1.5">
            {BUSINESS_MODELS.map(m => (
              <button
                key={m}
                onClick={() => toggle("businessModels", m)}
                className={cn(
                  "text-xs font-medium px-2.5 py-1 rounded-full border transition-all",
                  filters.businessModels.includes(m)
                    ? "bg-cr-copper text-white border-cr-copper"
                    : "border-cr-p4 text-cr-i3 hover:border-cr-copper"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </Section>

        <Separator />

        {/* Funding target */}
        <Section title="Funding Target">
          <div className="px-1 pt-1">
            <Slider
              min={0} max={10_000_000} step={100_000}
              value={[filters.fundingMin, filters.fundingMax]}
              onValueChange={([min, max]) => onChange({ ...filters, fundingMin: min, fundingMax: max })}
            />
            <div className="flex justify-between text-xs text-cr-i3 mt-2 font-medium">
              <span>${(filters.fundingMin / 1_000_000).toFixed(1)}M</span>
              <span>${(filters.fundingMax / 1_000_000).toFixed(1)}M</span>
            </div>
          </div>
        </Section>

        <Separator />

        {/* MRR */}
        <Section title="Monthly Revenue (MRR)">
          <div className="px-1 pt-1">
            <Slider
              min={0} max={500_000} step={5_000}
              value={[filters.mrrMin, filters.mrrMax]}
              onValueChange={([min, max]) => onChange({ ...filters, mrrMin: min, mrrMax: max })}
            />
            <div className="flex justify-between text-xs text-cr-i3 mt-2 font-medium">
              <span>${(filters.mrrMin / 1_000).toFixed(0)}K</span>
              <span>${(filters.mrrMax / 1_000).toFixed(0)}K</span>
            </div>
          </div>
        </Section>

        <Separator />

        {/* Country */}
        <Section title="Country / Region" defaultOpen={false}>
          <div className="relative">
            <input
              type="text"
              value={filters.country}
              onChange={e => onChange({ ...filters, country: e.target.value })}
              placeholder="e.g. United States"
              className="w-full h-8 px-3 text-sm border border-cr-p4 rounded-lg focus:outline-none focus:ring-2 focus:ring-cr-copper"
            />
            {filters.country && (
              <button
                onClick={() => onChange({ ...filters, country: "" })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-cr-i4 hover:text-cr-i3"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {["United States", "United Kingdom", "India", "Global"].map(c => (
              <button
                key={c}
                onClick={() => onChange({ ...filters, country: filters.country === c ? "" : c })}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                  filters.country === c ? "bg-cr-cu-d text-white border-cr-cu-d" : "border-cr-p4 text-cr-i3 hover:border-cr-i4"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </Section>
      </div>
    </aside>
  );
}
