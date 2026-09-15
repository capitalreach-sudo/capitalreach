import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";

/**
 * One past due-diligence report's full content -- the companion read to
 * ../route.ts's light list. Ownership-checked the same way the report was
 * written: it must belong to the caller's own investor row.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isUuid(params.id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const admin = createAdminClient();
  const { data: investor } = await admin
    .from("investors").select("id").eq("owner_id", user.id).maybeSingle();
  if (!investor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: report } = await admin
    .from("ai_reports")
    .select("id, content, startup_id, created_at")
    .eq("id", params.id)
    .eq("investor_id", investor.id)
    .eq("type", "due_diligence")
    .maybeSingle();
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: startup } = await admin.from("startups").select("name").eq("id", report.startup_id).maybeSingle();

  return NextResponse.json({
    id: report.id,
    content: report.content,
    startupName: startup?.name ?? "Startup",
    createdAt: report.created_at,
  });
}
