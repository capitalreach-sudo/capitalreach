import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";
import { sendUnsuspensionEmail } from "@/lib/resend";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { adminId, admin } = guard;

  const { userId } = await req.json().catch(() => ({}));
  if (!userId) return NextResponse.json({ error: "User is required" }, { status: 400 });

  const { data: target } = await admin
    .from("profiles")
    .select("id, email, full_name, suspended, account_status")
    .eq("id", userId)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const wasSuspended = target.suspended
    || target.account_status === "suspended"
    || target.account_status === "banned";

  if (!wasSuspended) {
    return NextResponse.json({ error: "Account is not suspended" }, { status: 400 });
  }

  const { error } = await admin
    .from("profiles")
    .update({
      suspended:        false,
      suspended_at:     null,
      suspended_reason: null,
      suspended_by:     null,
      suspended_until:  null,
      account_status:   "active",
    })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: "Failed to restore account" }, { status: 500 });
  }

  await logAdminAction(admin, adminId, "unsuspend_user", "profile", userId, {
    previous_status: target.account_status,
  });

  if (target.email) {
    await sendUnsuspensionEmail(target.email, target.full_name || "there").catch(() => {});
  }

  return NextResponse.json({ success: true });
}
