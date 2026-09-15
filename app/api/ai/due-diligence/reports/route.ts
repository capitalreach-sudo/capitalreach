import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

/**
 * Past due-diligence reports for the signed-in investor.
 *
 * app/api/ai/due-diligence/route.ts already persists every successful report
 * to ai_reports (type "due_diligence"), and the /ai tier table markets
 * "Saved Reports" as a Pro feature -- but nothing on the page let an investor
 * see anything but the single most recent, in-memory report. This is the
 * list read, kept light (no content); [id]/route.ts returns one report's
 * full text on demand.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: investor } = await admin
    .from("investors").select("id").eq("owner_id", user.id).maybeSingle();
  if (!investor) return NextResponse.json({ reports: [] });

  const { data: rows } = await admin
    .from("ai_reports")
    .select("id, startup_id, created_at")
    .eq("investor_id", investor.id)
    .eq("type", "due_diligence")
    .order("created_at", { ascending: false })
    .limit(25);

  const startupIds = Array.from(new Set((rows ?? []).map((r) => r.startup_id as string).filter(Boolean)));
  const names = new Map<string, { name: string; slug: string | null }>();
  if (startupIds.length) {
    const { data: startups } = await admin.from("startups").select("id, name, slug").in("id", startupIds);
    for (const s of startups ?? []) names.set(s.id as string, { name: s.name as string, slug: (s.slug as string) ?? null });
  }

  const reports = (rows ?? []).map((r) => ({
    id: r.id,
    startupId: r.startup_id,
    startupName: names.get(r.startup_id as string)?.name ?? "Startup",
    startupSlug: names.get(r.startup_id as string)?.slug ?? null,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ reports });
}
