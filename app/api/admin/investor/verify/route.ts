import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-guard";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * Grant or withdraw the verified badge on an investor.
 *
 * Verification is an admin's judgement recorded with a timestamp and their
 * id -- "verified when, by whom" is the first question the badge raises. The
 * badge replaced a filter that treated "pays us" as verified, which misled
 * exactly the founders it was meant to protect.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;

  const { investorId, verified, checks } = await req.json().catch(() => ({}));
  // Which checks this verification stands on. Free-text is refused: the
  // popover renders translation keys, and unknown strings would leak
  // whatever an admin typed onto a public page.
  const KNOWN_CHECKS = ["identity", "registry", "domain", "metrics"];
  const checkList: string[] = Array.isArray(checks)
    ? checks.filter((c: unknown) => typeof c === "string" && KNOWN_CHECKS.includes(c))
    : KNOWN_CHECKS.slice(0, 3); // legacy callers: identity, registry, domain
  if (!isUuid(investorId) || typeof verified !== "boolean") {
    return NextResponse.json({ error: "investorId and verified required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: investor, error } = await admin
    .from("investors")
    .update({
      verified_at: verified ? new Date().toISOString() : null,
      verified_by: verified ? guard.adminId : null,
      verification_checks: verified ? { checks: checkList, at: new Date().toISOString() } : null,
    })
    .eq("id", investorId)
    .select("id, owner_id, display_name")
    .single();
  if (error || !investor) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Same log as every other administrative act.
  await admin.from("admin_actions").insert({
    admin_id: guard.adminId,
    action: verified ? "verify" : "unverify",
    target_type: "investor",
    target_id: investorId,
    note: investor.display_name,
  });

  // Granting is worth telling the investor about; quiet withdrawal is
  // deliberate -- "your badge was removed" invites a support fight before
  // the admin has decided how to explain it.
  if (verified && investor.owner_id) {
    await notifyUser({
      userId: investor.owner_id,
      type: "verified",
      title: "You're verified",
      body: "An admin reviewed your profile. Founders now see a verified badge on it.",
      href: "/dashboard/investor",
    });
  }

  return NextResponse.json({ ok: true, verified });
}
