import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";

/**
 * C36: AI reports were capped at ten and inert — no list, no delete, no
 * export. GET returns the caller's own reports (with the deal, if one
 * exists, so a report can be opened from the deal it belongs to);
 * DELETE removes one of the caller's own.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: inv } = await admin.from("investors").select("id").eq("owner_id", user.id).maybeSingle();
  if (!inv) return NextResponse.json({ reports: [] });

  const { data: reports } = await admin
    .from("ai_reports")
    .select("id, type, content, created_at, startup_id, startup:startups(name, slug)")
    .eq("investor_id", inv.id)
    .order("created_at", { ascending: false })
    .limit(200);

  // Link each report to the deal on that startup, when there is one.
  const ids = Array.from(new Set((reports ?? []).map((r) => r.startup_id).filter(Boolean)));
  const dealByStartup: Record<string, string> = {};
  if (ids.length) {
    const { data: deals } = await admin.from("deals").select("id, startup_id").eq("investor_id", inv.id).in("startup_id", ids);
    for (const d of deals ?? []) dealByStartup[d.startup_id] = d.id;
  }
  return NextResponse.json({
    reports: (reports ?? []).map((r) => ({ ...r, dealId: r.startup_id ? dealByStartup[r.startup_id] ?? null : null })),
  });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!isUuid(id ?? "")) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: inv } = await admin.from("investors").select("id").eq("owner_id", user.id).maybeSingle();
  if (!inv) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await admin.from("ai_reports").delete().match({ id, investor_id: inv.id }).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
