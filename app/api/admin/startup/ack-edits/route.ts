import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-guard";

/** POST { startupId } — admin has re-checked a live listing after founder edits. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin("operator");
  if (!guard.ok) return guard.response;

  const { startupId } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(startupId))) return NextResponse.json({ error: "Invalid startup" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("startups").update({ edited_since_review_at: null }).eq("id", startupId);
  if (error) return NextResponse.json({ error: "Failed" }, { status: 500 });
  await admin.from("admin_actions").insert({ admin_id: guard.adminId, target_id: startupId, target_type: "startup", action: "ack_edits" }).then(undefined, () => {});
  return NextResponse.json({ success: true });
}
