import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * E52: getting a locked-out member back in.
 *
 * Login supports TOTP. A member who loses their phone loses the account —
 * there is no recovery path a user can walk on their own, and there should
 * not be one, because a self-service second-factor reset is not a second
 * factor. So it is an operator action, at the highest level, and it is loud:
 * the account owner is told their second factor was removed, so a reset they
 * did not ask for cannot happen quietly.
 *
 * GET  ?userId= — which factors exist (never their secrets).
 * POST { userId } — remove them all.
 */

export async function GET(req: NextRequest) {
  const guard = await requireAdmin("owner");
  if (!guard.ok) return guard.response;

  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  if (!isUuid(userId)) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { data, error } = await guard.admin.auth.admin.mfa.listFactors({ userId });
  if (error) return NextResponse.json({ error: "Could not read factors" }, { status: 500 });

  return NextResponse.json({
    factors: (data?.factors ?? []).map(f => ({
      id: f.id, type: f.factor_type, status: f.status, friendlyName: f.friendly_name ?? null, createdAt: f.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin("owner");
  if (!guard.ok) return guard.response;

  const { userId } = await req.json().catch(() => ({}));
  if (!isUuid(userId ?? "")) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { data, error } = await guard.admin.auth.admin.mfa.listFactors({ userId });
  if (error) return NextResponse.json({ error: "Could not read factors" }, { status: 500 });
  const factors = data?.factors ?? [];
  if (!factors.length) return NextResponse.json({ error: "That account has no second factor set up." }, { status: 409 });

  const results = await Promise.all(
    factors.map(f => guard.admin.auth.admin.mfa.deleteFactor({ userId, id: f.id }))
  );
  const failed = results.filter(r => r.error).length;
  if (failed) return NextResponse.json({ error: `Removed ${factors.length - failed} of ${factors.length}. Try again.` }, { status: 500 });

  await logAdminAction(guard.admin, guard.adminId, "mfa_reset", "profile", userId, { factors: factors.length });

  // Loud on purpose. If this was not the owner's request, they find out now.
  await notifyUser({
    userId,
    type: "fee_due",
    title: "Two-factor authentication was removed",
    body: "An administrator removed the second factor on your account. If this was not at your request, contact us immediately and set it up again.",
    href: "/dashboard/settings",
  }).catch(() => {});

  return NextResponse.json({ success: true, removed: factors.length });
}
