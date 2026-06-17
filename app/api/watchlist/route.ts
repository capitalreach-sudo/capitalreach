import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId } = await req.json() as { startupId: string };
  if (!startupId) return NextResponse.json({ error: "startupId required" }, { status: 400 });

  const { error } = await supabase
    .from("watchlists")
    .upsert({ investor_id: user.id, startup_id: startupId }, { onConflict: "investor_id,startup_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ saved: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId } = await req.json() as { startupId: string };
  if (!startupId) return NextResponse.json({ error: "startupId required" }, { status: 400 });

  const { error } = await supabase
    .from("watchlists")
    .delete()
    .eq("investor_id", user.id)
    .eq("startup_id", startupId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ saved: false });
}
