import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatCurrency(amount: number, compact = false): string {
  if (compact) {
    // Every tier, not just K/M -- a $100B test listing once rendered as
    // "$100000000000.0M" on production cards.
    const tier = (v: number, d: number, s: string) => `$${(amount / v).toFixed(d).replace(/\.0$/, "")}${s}`;
    if (amount >= 1_000_000_000_000) return tier(1_000_000_000_000, 1, "T");
    if (amount >= 1_000_000_000)     return tier(1_000_000_000, 1, "B");
    if (amount >= 1_000_000)         return tier(1_000_000, 1, "M");
    if (amount >= 1_000)             return tier(1_000, 0, "K");
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatPercent(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function daysSince(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}


export const STAGE_LABELS: Record<string, string> = {
  "pre-seed": "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b_plus: "Series B+",
};


export const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  active: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  suspended: "bg-red-500/10 text-red-400 border border-red-500/20",
  archived: "bg-cr-p3 text-cr-i4 border border-cr-p4",
  draft: "bg-cr-p3 text-cr-i4 border border-cr-p4",
};

/**
 * Strict v4-ish UUID check for user-supplied ids. Postgres raises 22P02 on a
 * malformed uuid, which used to surface as a raw 500 from routes that
 * interpolated ids straight into queries; validate first and 400 instead.
 */
export function isUuid(v: unknown): v is string {
  return typeof v === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
