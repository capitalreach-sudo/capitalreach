import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";
import { logSystemEvent } from "@/lib/system-events";

/**
 * Operator side of complaints. Service role throughout (no admin RLS
 * policies exist by design — see admin-guard). Every transition notifies the
 * filer: the whole point of the lifecycle is that the filer can see it move.
 *
 * GET ?status=open|in_review|resolved|dismissed|all
 * POST { id, status, resolutionNote? } — move a complaint
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const status = req.nextUrl.searchParams.get("status") ?? "open";
  let q = admin.from("complaints")
    .select("id, opened_by, category, subject, body, status, resolution_note, created_at, resolved_at")
    .order("created_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data: rows } = await q;

  // Name the filers (service role; profiles are not world-readable since 079).
  const ids = Array.from(new Set((rows ?? []).map(r => r.opened_by)));
  const { data: profs } = ids.length
    ? await admin.from("profiles").select("id, full_name, role").in("id", ids)
    : { data: [] };
  const byId = new Map((profs ?? []).map(p => [p.id, p]));
  return NextResponse.json({
    complaints: (rows ?? []).map(r => ({
      ...r,
      filerName: byId.get(r.opened_by)?.full_name ?? "Unknown user",
      filerRole: byId.get(r.opened_by)?.role ?? null,
    })),
  });
}

const NEXT_STATUSES = ["in_review", "resolved", "dismissed"] as const;

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const { id, status, resolutionNote } = await req.json().catch(() => ({}));
  if (!isUuid(id ?? "")) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!NEXT_STATUSES.includes(status)) return NextResponse.json({ error: "Bad status" }, { status: 400 });
  const note = typeof resolutionNote === "string" && resolutionNote.trim()
    ? resolutionNote.trim().slice(0, 2000) : null;
  const terminal = status === "resolved" || status === "dismissed";
  if (terminal && !note) return NextResponse.json({ error: "A resolution note is required" }, { status: 400 });

  const { data: row } = await admin.from("complaints")
    .select("id, opened_by, subject, status").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status === "resolved" || row.status === "dismissed") {
    return NextResponse.json({ error: "Already closed" }, { status: 409 });
  }

  const { error } = await admin.from("complaints").update({
    status,
    resolution_note: note,
    updated_at: new Date().toISOString(),
    resolved_at: terminal ? new Date().toISOString() : null,
  }).eq("id", id);
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  await logSystemEvent("complaints", "info", `complaint ${status}`, { complaintId: id, by: guard.adminId }).catch(() => {});
  await notifyUser({
    userId: row.opened_by,
    type: "complaint_update",
    title: status === "in_review" ? "Your complaint is being reviewed"
      : status === "resolved" ? "Your complaint was resolved" : "Your complaint was closed",
    body: note ?? row.subject,
    href: "/dashboard/complaints",
  }).catch(() => {});
  return NextResponse.json({ success: true });
}
