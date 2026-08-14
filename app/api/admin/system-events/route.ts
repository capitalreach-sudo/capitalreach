import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";

/**
 * Acknowledge (delete) a system event from the admin health panel.
 *
 * Deletion IS the acknowledgement model: an error stays on the panel until an
 * admin has seen it and dismissed it, and dismissing removes the row. No read
 * flag, no archive — the table is an inbox, not a history (Vercel's own logs
 * remain the forensic record).
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Re-checked here, not assumed from middleware: this route deletes rows.
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await req.json().catch(() => ({}));
  if (!isUuid(id)) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("system_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
