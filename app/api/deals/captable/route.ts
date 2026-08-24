import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { resolveEntity } from "@/lib/membership";

/**
 * The founder's cap-table view: every CLOSED deal's frozen record — who,
 * how much, what percent, at what valuation, when. Reads the snapshot
 * written at close (names as they were, valuation as it was); older closes
 * that predate the snapshot fall back to the live columns and current
 * investor name.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mine = await resolveEntity(user.id, "startup");
  if (!mine) return NextResponse.json({ error: "Founders only" }, { status: 403 });

  const admin = createAdminClient();
  const { data: deals } = await admin
    .from("deals")
    .select("id, amount, currency, closed_at, ownership_percent, valuation_at_close, closing_snapshot, investor:investors(display_name, firm_name)")
    .eq("startup_id", mine.entityId)
    .eq("status", "closed")
    .order("closed_at", { ascending: true });

  const rows = (deals ?? []).map(d => {
    const snap = (d.closing_snapshot ?? {}) as {
      investor?: string | null; amount?: number | null; currency?: string | null;
      ownership_percent?: number | null; valuation_at_close?: number | null; at?: string | null;
    };
    const inv = d.investor as unknown as { display_name?: string | null; firm_name?: string | null } | null;
    return {
      id: d.id,
      investor: snap.investor ?? inv?.display_name ?? inv?.firm_name ?? null,
      amount: snap.amount ?? d.amount,
      currency: snap.currency ?? d.currency,
      ownershipPercent: snap.ownership_percent ?? d.ownership_percent,
      valuationAtClose: snap.valuation_at_close ?? d.valuation_at_close,
      closedAt: snap.at ?? d.closed_at,
    };
  });
  const totalPct = rows.reduce((a, r) => a + (r.ownershipPercent ?? 0), 0);
  return NextResponse.json({ rows, totalPct: Number(totalPct.toFixed(4)) });
}
