import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction, type AdminLevel } from "@/lib/admin-guard";
import { isUuid } from "@/lib/utils";

/**
 * E51: change another admin's level. Owner only, for the obvious reason.
 *
 * Two guards that matter more than the permission check:
 *  - you cannot change your own level, so nobody can quietly demote
 *    themselves out of a mistake or promote themselves past review;
 *  - the last owner cannot be demoted, because a platform with no owner has
 *    no way to grant the level back.
 */
const LEVELS: AdminLevel[] = ["support", "operator", "owner"];

export async function POST(req: NextRequest) {
  const guard = await requireAdmin("owner");
  if (!guard.ok) return guard.response;

  const { userId, level } = await req.json().catch(() => ({}));
  if (!isUuid(userId ?? "")) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (!LEVELS.includes(level)) return NextResponse.json({ error: "Unknown level" }, { status: 400 });
  if (userId === guard.adminId) return NextResponse.json({ error: "You cannot change your own level." }, { status: 403 });

  const { data: target } = await guard.admin
    .from("profiles").select("id, role, admin_level").eq("id", userId).maybeSingle();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.role !== "admin") return NextResponse.json({ error: "That account is not an admin." }, { status: 400 });

  if (target.admin_level === "owner" && level !== "owner") {
    const { count } = await guard.admin
      .from("profiles").select("id", { count: "exact", head: true })
      .eq("role", "admin").eq("admin_level", "owner");
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "This is the last owner. Promote someone else first." }, { status: 409 });
    }
  }

  const { error } = await guard.admin.from("profiles").update({ admin_level: level }).eq("id", userId);
  if (error) return NextResponse.json({ error: "Could not change the level" }, { status: 500 });

  await logAdminAction(guard.admin, guard.adminId, "admin_level_changed", "profile", userId, { from: target.admin_level, to: level });
  return NextResponse.json({ success: true, level });
}
