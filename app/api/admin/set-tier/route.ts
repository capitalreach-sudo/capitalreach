import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";
import { notifyUser } from "@/lib/notify-user";
import { FOUNDER_PLANS, INVESTOR_PLANS } from "@/lib/plans";

const FOUNDER_TIERS  = Object.keys(FOUNDER_PLANS);
const INVESTOR_TIERS = Object.keys(INVESTOR_PLANS);

/**
 * Admin sets a user's tier directly -- comping a founder, granting an
 * investor pro, or walking one back. Writes both places the app reads tier
 * from (profiles and the entity row), because they are read independently:
 * profiles by the access context, the entity by listing and deal surfaces.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { userId, tier } = await req.json().catch(() => ({}));
  if (typeof userId !== "string" || !userId || typeof tier !== "string") {
    return NextResponse.json({ error: "userId and tier are required" }, { status: 400 });
  }

  const admin = guard.admin;
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // The tier must belong to the user's side of the marketplace -- writing an
  // investor tier onto a founder would also violate the DB CHECKs.
  const valid = profile.role === "startup" ? FOUNDER_TIERS : INVESTOR_TIERS;
  if (!valid.includes(tier)) {
    return NextResponse.json(
      { error: `Tier must be one of: ${valid.join(", ")}` },
      { status: 400 }
    );
  }

  // Plan ids and DB slugs disagree for two investor tiers; the DB CHECKs
  // (and normaliseInvestorTier on the read side) use the long forms.
  const dbTier =
    profile.role !== "startup" && tier === "pro" ? "pro_investor"
    : tier === "institution" ? "institutional"
    : tier;

  const entityTable = profile.role === "startup" ? "startups" : "investors";
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    admin.from("profiles").update({ subscription_tier: dbTier }).eq("id", userId),
    admin.from(entityTable).update({ subscription_tier: dbTier }).eq("owner_id", userId),
  ]);
  if (e1 || e2) {
    console.error("[admin/set-tier]", e1 ?? e2);
    return NextResponse.json({ error: "Could not update tier" }, { status: 500 });
  }

  await logAdminAction(admin, guard.adminId, "set_tier", "profile", userId, { tier: dbTier });
  await notifyUser({
    userId,
    type:  "tier_changed",
    title: `Your plan is now ${tier === "free" ? "Free" : tier[0].toUpperCase() + tier.slice(1)}`,
    body:  "An administrator updated your subscription tier.",
    href:  profile.role === "startup" ? "/dashboard/startup/billing" : "/dashboard/investor",
  });

  return NextResponse.json({ ok: true, tier: dbTier });
}
