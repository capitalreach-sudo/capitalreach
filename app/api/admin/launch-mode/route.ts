import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase-server";
import { getLaunchStatus } from "@/lib/launchMode";

/**
 * Launch mode is the everyone-gets-top-tier state the platform starts in.
 * It already lives in platform_config and flips itself off at the member
 * target; this gives the admin the same switch explicitly -- ending the free
 * period early (tiers start binding) or extending it past the count.
 */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  return NextResponse.json(await getLaunchStatus());
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { enabled } = await req.json().catch(() => ({}));
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_config")
    .upsert({ key: "launch_mode", value: String(enabled) }, { onConflict: "key" });
  if (error) {
    console.error("[admin/launch-mode]", error);
    return NextResponse.json({ error: "Could not update launch mode" }, { status: 500 });
  }

  await logAdminAction(guard.admin, guard.adminId, enabled ? "launch_mode_on" : "launch_mode_off", "platform", null);
  return NextResponse.json(await getLaunchStatus());
}
