import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-guard";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * Grant or withdraw the verified badge on a startup — the founder-side mirror
 * of /api/admin/investor/verify. An admin's judgement recorded with a
 * timestamp and their id, surfaced to investors as an "identity checked"
 * signal on the listing.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;

  const { startupId, verified, checks } = await req.json().catch(() => ({}));
  // Which checks this verification stands on. Free-text is refused: the
  // popover renders translation keys, and unknown strings would leak
  // whatever an admin typed onto a public page.
  const KNOWN_CHECKS = ["identity", "registry", "domain", "metrics"];
  const checkList: string[] = Array.isArray(checks)
    ? checks.filter((c: unknown) => typeof c === "string" && KNOWN_CHECKS.includes(c))
    : KNOWN_CHECKS.slice(0, 3); // legacy callers: identity, registry, domain
  if (!isUuid(startupId) || typeof verified !== "boolean") {
    return NextResponse.json({ error: "startupId and verified required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: startup, error } = await admin
    .from("startups")
    .update({
      verified_at: verified ? new Date().toISOString() : null,
      // Verifying is a re-check; the "edited since approval" flag is cleared.
      ...(verified ? { edited_since_review_at: null } : {}),
      verified_by: verified ? guard.adminId : null,
      verification_checks: verified ? { checks: checkList, at: new Date().toISOString() } : null,
    })
    .eq("id", startupId)
    .select("id, owner_id, name")
    .single();
  if (error || !startup) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await admin.from("admin_actions").insert({
    admin_id: guard.adminId,
    action: verified ? "verify" : "unverify",
    target_type: "startup",
    target_id: startupId,
  }).then(undefined, () => {});

  if (verified) {
    await notifyUser({
      userId: startup.owner_id,
      type: "verified",
      title: "Your company is now verified",
      body: `${startup.name} carries the verified badge — investors see it on your listing.`,
      href: `/dashboard/startup`,
    }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
