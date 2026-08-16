import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";
import { sendSuspensionEmail } from "@/lib/resend";

const DURATIONS: Record<string, number | null> = {
  "1d":          1,
  "7d":          7,
  "30d":         30,
  "indefinite":  null,
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { adminId, admin } = guard;

  const { userId, reason, duration } = await req.json().catch(() => ({}));

  if (!userId || typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "User and reason are required" }, { status: 400 });
  }
  if (duration && !(duration in DURATIONS)) {
    return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
  }

  // An admin must not be able to lock themselves out of the admin panel.
  if (userId === adminId) {
    return NextResponse.json({ error: "You cannot suspend your own account" }, { status: 400 });
  }

  const { data: target } = await admin
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Admins are protected from each other — demote first if this is intended.
  if (target.role === "admin") {
    return NextResponse.json(
      { error: "Cannot suspend an admin. Change their role first." },
      { status: 400 }
    );
  }

  const days = duration ? DURATIONS[duration] : null;
  const suspendedUntil = days
    ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { error } = await admin
    .from("profiles")
    .update({
      suspended:        true,
      suspended_at:     new Date().toISOString(),
      suspended_reason: reason.trim(),
      suspended_by:     adminId,
      suspended_until:  suspendedUntil,
      account_status:   "suspended",
    })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: "Failed to suspend account" }, { status: 500 });
  }

  // A suspended founder's listing must leave the marketplace with them —
  // otherwise it stays live, indexed, and messageable while its owner is
  // locked out. Only active listings flip; drafts/pending are untouched, and
  // unsuspend restores exactly these rows.
  await admin.from("startups").update({ status: "suspended" })
    .eq("owner_id", userId).eq("status", "active");

  await logAdminAction(admin, adminId, "suspend_user", "profile", userId, {
    reason: reason.trim(),
    duration: duration ?? "indefinite",
    suspended_until: suspendedUntil,
  });

  // Revoke live sessions so the suspension takes effect immediately rather
  // than whenever their current token happens to expire.
  try {
    await admin.auth.admin.signOut(userId, "global");
  } catch (err) {
    console.error("[admin/suspend] Could not revoke sessions:", err);
  }

  if (target.email) {
    await sendSuspensionEmail(
      target.email,
      target.full_name || "there",
      reason.trim(),
      suspendedUntil,
    ).catch(() => {});
  }

  return NextResponse.json({ success: true, suspendedUntil });
}
