import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

/**
 * 140: the vaultrise_score trend -- every scoring event on this listing, not
 * just the current scalar startups.vaultrise_score holds. Written at the two
 * places a score is ever produced (admin/startup/approve, cron/follow-ups);
 * read here the same way every other founder-only aggregate on this
 * dashboard is read (see engagement/viewers/savers/doc-views): caller
 * authenticated via RLS client, ownership re-checked against
 * startups.owner_id, the actual rows via service role.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: startup } = await admin
    .from("startups").select("id").eq("owner_id", user.id).maybeSingle();
  if (!startup) return NextResponse.json({ history: [] });

  const { data } = await admin
    .from("score_history")
    .select("score, scored_at")
    .eq("startup_id", startup.id)
    .order("scored_at", { ascending: true })
    .limit(120);

  return NextResponse.json({ history: data ?? [] });
}
