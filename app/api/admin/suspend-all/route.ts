import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";

// Emergency platform-wide lockdown, and its reverse.
//
// Deliberately blunt: it does NOT email anyone. A bulk suspension is either an
// incident response or a maintenance window, and firing thousands of "you have
// been suspended" emails would turn an internal action into a public one. The
// /suspended page explains the situation instead.
//
// Admins are always excluded — otherwise the person running this locks
// themselves out of the panel needed to reverse it.

const CONFIRM_PHRASE = "SUSPEND ALL";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin("owner");
  if (!guard.ok) return guard.response;
  const { adminId, admin } = guard;

  const { action, confirm, reason } = await req.json().catch(() => ({}));

  if (action !== "suspend" && action !== "unsuspend") {
    return NextResponse.json({ error: "action must be 'suspend' or 'unsuspend'" }, { status: 400 });
  }

  // Typed confirmation is required for the destructive direction only.
  if (action === "suspend" && confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Confirmation phrase required. Type "${CONFIRM_PHRASE}" to proceed.` },
      { status: 400 }
    );
  }

  if (action === "suspend") {
    const suspensionReason = (typeof reason === "string" && reason.trim())
      ? reason.trim()
      : "Platform temporarily unavailable. Please check back shortly.";

    // neq('role','admin') keeps every admin account usable.
    const { data, error } = await admin
      .from("profiles")
      .update({
        suspended:        true,
        suspended_at:     new Date().toISOString(),
        suspended_reason: suspensionReason,
        suspended_by:     adminId,
        suspended_until:  null,
        account_status:   "suspended",
      })
      .neq("role", "admin")
      .eq("suspended", false)   // don't overwrite existing individual suspensions
      .select("id");

    if (error) {
      return NextResponse.json({ error: "Bulk suspension failed" }, { status: 500 });
    }

    const ids = (data ?? []).map(r => r.id as string);

    await logAdminAction(admin, adminId, "suspend_all_users", "platform", null, {
      reason: suspensionReason,
      affected_count: ids.length,
    });

    // Best-effort session revocation. Bounded concurrency so a large user base
    // doesn't open thousands of simultaneous connections.
    let revoked = 0;
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map(id => admin.auth.admin.signOut(id, "global"))
      );
      revoked += results.filter(r => r.status === "fulfilled").length;
    }

    return NextResponse.json({ success: true, suspended: ids.length, sessionsRevoked: revoked });
  }

  // ── Unsuspend all ──────────────────────────────────────────────────────────
  // Only lifts suspensions this endpoint created, identified by account_status
  // 'suspended'. Accounts marked 'banned' are left alone — a bulk restore must
  // not quietly reinstate individually banned users.
  const { data, error } = await admin
    .from("profiles")
    .update({
      suspended:        false,
      suspended_at:     null,
      suspended_reason: null,
      suspended_by:     null,
      suspended_until:  null,
      account_status:   "active",
    })
    .eq("account_status", "suspended")
    .select("id");

  if (error) {
    return NextResponse.json({ error: "Bulk restore failed" }, { status: 500 });
  }

  const count = (data ?? []).length;
  await logAdminAction(admin, adminId, "unsuspend_all_users", "platform", null, {
    affected_count: count,
  });

  return NextResponse.json({ success: true, restored: count });
}
