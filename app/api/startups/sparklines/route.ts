import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const revalidate = 300;

/**
 * Sparkline shapes for the directory: per active listing, up to 12 months of
 * MRR NORMALISED to 0..1. Absolute revenue is a financial-tier fact (the
 * detail page gates it); the SHAPE at card level is the same class of signal
 * as the growth-rate percentage the cards already show. Normalising on the
 * server means no absolute value ever leaves it on this route.
 */
export async function GET() {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("startup_metrics")
    .select("startup_id, month, mrr, startup:startups!inner(status, round_state)")
    .eq("startup.status", "active")
    .neq("startup.round_state", "paused")
    .order("month", { ascending: true });

  const series = new Map<string, number[]>();
  for (const r of rows ?? []) {
    if (r.mrr == null) continue;
    const arr = series.get(r.startup_id) ?? [];
    arr.push(Number(r.mrr));
    series.set(r.startup_id, arr);
  }

  const out: Record<string, number[]> = {};
  for (const [id, values] of Array.from(series.entries())) {
    const v = values.slice(-12);
    if (v.length < 4) continue; // three points is a squiggle, not a trend
    const min = Math.min(...v), max = Math.max(...v);
    out[id] = max === min
      ? v.map(() => 0.5)
      : v.map((x: number) => Math.round(((x - min) / (max - min)) * 100) / 100);
  }
  return NextResponse.json({ sparks: out });
}
