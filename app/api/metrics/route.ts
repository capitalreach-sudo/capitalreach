import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

/**
 * A founder's monthly metric snapshots (startup_metrics, migration 050).
 *
 * GET  → own listing's rows, oldest first (chart-ready).
 * POST → upsert one month { month: "YYYY-MM", mrr?, arr?, userCount?, payingCustomers? }.
 *        Upsert, not insert: correcting last month's typo must not need a
 *        support ticket. All figures optional -- a pre-revenue company
 *        records users, not MRR.
 *
 * Ownership is resolved server-side from the session, never taken from the
 * body; team members write through the same resolution the rest of the
 * founder surface uses (owner_id or team_members).
 */
async function myStartupId(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: own } = await admin.from("startups").select("id").eq("owner_id", userId).maybeSingle();
  if (own) return own.id;
  const { data: member } = await admin
    .from("team_members").select("entity_id").eq("user_id", userId).eq("entity_type", "startup").maybeSingle();
  return member?.entity_id ?? null;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startupId = await myStartupId(user.id);
  if (!startupId) return NextResponse.json({ metrics: [] });

  const admin = createAdminClient();
  const { data } = await admin
    .from("startup_metrics")
    .select("month, mrr, arr, user_count, paying_customers")
    .eq("startup_id", startupId)
    .order("month", { ascending: true })
    .limit(36);
  return NextResponse.json({ metrics: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startupId = await myStartupId(user.id);
  if (!startupId) return NextResponse.json({ error: "No listing" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month ?? "")) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  const num = (v: unknown, max: number): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    // Bounded by the same sanity ceilings the listing validators use --
    // a fat-fingered 10^12 MRR must not silently wreck the chart's scale.
    return Number.isFinite(n) && n >= 0 && n <= max ? n : NaN;
  };
  const mrr = num(body.mrr, 100_000_000);
  const arr = num(body.arr, 1_200_000_000);
  const userCount = num(body.userCount, 1_000_000_000);
  const payingCustomers = num(body.payingCustomers, 1_000_000_000);
  if ([mrr, arr, userCount, payingCustomers].some((v) => Number.isNaN(v))) {
    return NextResponse.json({ error: "A figure is out of range." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("startup_metrics").upsert(
    {
      startup_id: startupId,
      month: `${body.month}-01`,
      mrr, arr,
      user_count: userCount == null ? null : Math.round(userCount),
      paying_customers: payingCustomers == null ? null : Math.round(payingCustomers),
    },
    { onConflict: "startup_id,month" },
  );
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
