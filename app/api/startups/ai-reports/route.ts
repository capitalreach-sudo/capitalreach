import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

/**
 * Audit finding #1: app/api/ai/pitch-feedback writes every report a founder
 * generates to ai_reports (startup_id set, investor_id null), but the only
 * read path -- app/api/ai/reports GET -- looks up the caller's *investor*
 * row and comes back empty for a founder every time. A founder therefore had
 * no way to see a report again after the page that showed it in memory was
 * closed or refreshed, including one they had just paid AI allowance for.
 *
 * This is the founder-side read: same authorization shape as
 * score-history/engagement/viewers/savers/doc-views (RLS client identifies
 * the caller, ownership re-checked against startups.owner_id, the rows read
 * via service role). Newest first; the client treats [0] as "current" and
 * the rest as history, the same split UpdateComposer already uses for
 * startup_updates.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: startup } = await admin
    .from("startups").select("id").eq("owner_id", user.id).maybeSingle();
  if (!startup) return NextResponse.json({ reports: [] });

  const { data } = await admin
    .from("ai_reports")
    .select("id, content, created_at")
    .eq("startup_id", startup.id)
    .eq("type", "pitch_feedback")
    .order("created_at", { ascending: false })
    .limit(25);

  // content is stored as a JSON string (see pitch-feedback/route.ts); a row
  // that fails to parse is dropped rather than handed to the client as a
  // string the UI would try to render as an object.
  const reports = (data ?? []).flatMap((r) => {
    try {
      const feedback = JSON.parse(r.content);
      return [{ id: r.id, createdAt: r.created_at, ...feedback }];
    } catch {
      return [];
    }
  });

  return NextResponse.json({ reports });
}
