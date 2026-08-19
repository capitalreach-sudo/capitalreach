import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * E50, operator side: the report queue.
 *
 * Resolving a report is a judgement with two outcomes, and both are recorded:
 * "actioned" means something was done about the content, "dismissed" means it
 * was looked at and was fine. Nothing is deleted here — acting on a listing
 * still goes through the suspend/reject routes, which have their own audit.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const status = req.nextUrl.searchParams.get("status") ?? "open";
  let query = guard.admin
    .from("content_reports")
    .select("id, target_type, target_id, reason, detail, status, created_at, resolution, resolved_at, reporter_id")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

  // The names the queue needs to be readable — resolved per target type
  // rather than embedded, because target_id points at four different tables.
  const rows = data ?? [];
  const startupIds = rows.filter(r => r.target_type === "startup").map(r => r.target_id);
  const investorIds = rows.filter(r => r.target_type === "investor").map(r => r.target_id);
  const [{ data: startups }, { data: investors }] = await Promise.all([
    startupIds.length ? guard.admin.from("startups").select("id, name, slug, status").in("id", startupIds) : Promise.resolve({ data: [] }),
    investorIds.length ? guard.admin.from("investors").select("id, slug, display_name, firm_name").in("id", investorIds) : Promise.resolve({ data: [] }),
  ]);

  return NextResponse.json({
    reports: rows.map(r => {
      const s = (startups ?? []).find(x => x.id === r.target_id);
      const i = (investors ?? []).find(x => x.id === r.target_id);
      return {
        ...r,
        targetName: s?.name ?? i?.firm_name ?? i?.display_name ?? null,
        targetHref: s ? `/startups/${s.slug}` : i ? `/investors/${i.slug}` : null,
        targetStatus: s?.status ?? null,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;

  const { reportId, status, resolution } = await req.json().catch(() => ({}));
  if (!isUuid(reportId ?? "")) return NextResponse.json({ error: "reportId required" }, { status: 400 });
  if (status !== "actioned" && status !== "dismissed") {
    return NextResponse.json({ error: "status must be actioned or dismissed" }, { status: 400 });
  }
  const note = typeof resolution === "string" && resolution.trim() ? resolution.trim().slice(0, 500) : null;

  const { data: report } = await guard.admin
    .from("content_reports").select("id, status, reporter_id, target_type").eq("id", reportId).maybeSingle();
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (report.status !== "open") return NextResponse.json({ error: "This report is already closed." }, { status: 409 });

  const { error } = await guard.admin.from("content_reports").update({
    status, resolution: note, resolved_at: new Date().toISOString(), resolved_by: guard.adminId,
  }).eq("id", reportId);
  if (error) return NextResponse.json({ error: "Could not update it" }, { status: 500 });

  await logAdminAction(guard.admin, guard.adminId, `report_${status}`, "platform", reportId, { targetType: report.target_type, resolution: note });

  // The person who reported it hears back. A report that vanishes teaches
  // people not to file the next one.
  if (report.reporter_id) {
    await notifyUser({
      userId: report.reporter_id,
      type: "fee_due",
      title: status === "actioned" ? "Thanks — we acted on your report" : "We looked at your report",
      body: status === "actioned" ? "We took action on what you reported." : "We reviewed it and took no action this time.",
      href: "/dashboard",
    }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
