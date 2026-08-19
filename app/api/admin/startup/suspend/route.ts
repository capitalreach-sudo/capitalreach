import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

export async function POST(req: NextRequest) {
  // Shared guard: reads the role with the service client and rejects a
  // suspended/banned admin — the hand-rolled check this replaced skipped that.
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;
  const { adminId, admin: adminClient } = guard;

  const { startupId, note } = await req.json().catch(() => ({}));
  if (typeof startupId !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { error } = await adminClient
    .from("startups")
    .update({ status: "suspended" })
    .eq("id", startupId);

  if (error) {
    return NextResponse.json({ error: "Failed to suspend listing" }, { status: 500 });
  }

  await adminClient.from("admin_actions").insert({
    admin_id: adminId,
    target_id: startupId,
    target_type: "startup",
    action: "suspend",
    note: note || null,
  });

  return NextResponse.json({ success: true });
}
