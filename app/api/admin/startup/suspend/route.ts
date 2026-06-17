import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const { startupId, note } = await req.json();
  const adminClient = createAdminClient();

  await adminClient
    .from("startups")
    .update({ status: "suspended" })
    .eq("id", startupId);

  await adminClient.from("admin_actions").insert({
    admin_id: user.id,
    target_id: startupId,
    target_type: "startup",
    action: "suspend",
    note: note || null,
  });

  return NextResponse.json({ success: true });
}
