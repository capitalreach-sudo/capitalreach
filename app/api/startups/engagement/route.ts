import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

/**
 * The founder's interaction ledger (migration 107) -- what people DID beyond
 * looking: outbound clicks, video plays, booking opens, shares, plus the two
 * signals that were tracked but shown nowhere (interest, waitlist) and the
 * conversations count that was missing from every founder surface.
 *
 * Same authorization shape as viewers/savers/doc-views: caller authenticated
 * via RLS client, ownership re-checked against startups.owner_id, aggregates
 * via service role because the underlying tables are service-role only.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: startup } = await admin
    .from("startups").select("id").eq("owner_id", user.id).maybeSingle();
  if (!startup) return NextResponse.json({ events: {}, interest: 0, waitlist: 0, conversations: 0 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [eventsRes, interestRes, waitlistRes, threadsRes] = await Promise.all([
    admin.from("profile_events")
      .select("event")
      .eq("entity_type", "startup").eq("entity_id", startup.id)
      .gte("created_at", thirtyDaysAgo)
      .limit(5000),
    admin.from("interest_signals")
      .select("id", { count: "exact", head: true })
      .eq("target_type", "startup").eq("target_id", startup.id),
    admin.from("round_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("startup_id", startup.id),
    admin.from("threads")
      .select("id", { count: "exact", head: true })
      .eq("startup_id", startup.id)
      .gte("created_at", thirtyDaysAgo),
  ]);

  const events: Record<string, number> = {};
  for (const row of eventsRes.data ?? []) {
    events[row.event] = (events[row.event] ?? 0) + 1;
  }

  return NextResponse.json({
    events,
    interest: interestRes.count ?? 0,
    waitlist: waitlistRes.count ?? 0,
    conversations: threadsRes.count ?? 0,
  });
}
