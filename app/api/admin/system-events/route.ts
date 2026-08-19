import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-guard";
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
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await req.json().catch(() => ({}));
  if (!isUuid(id)) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("system_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Delete failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
