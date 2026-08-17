import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

/** POST { startupId } — admin has re-checked a live listing after founder edits. */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { startupId } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(startupId))) return NextResponse.json({ error: "Invalid startup" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("startups").update({ edited_since_review_at: null }).eq("id", startupId);
  if (error) return NextResponse.json({ error: "Failed" }, { status: 500 });
  await admin.from("admin_actions").insert({ admin_id: user.id, target_id: startupId, target_type: "startup", action: "ack_edits" }).then(undefined, () => {});
  return NextResponse.json({ success: true });
}
