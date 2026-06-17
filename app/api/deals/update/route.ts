import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dealId, status } = await req.json();

  // Verify participant
  const { data: deal } = await supabase
    .from("deals")
    .select("startup_id, investor_id, startup:startups(owner_id), investor:investors(owner_id)")
    .eq("id", dealId)
    .single();

  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isParticipant =
    (deal.startup as any)?.owner_id === user.id ||
    (deal.investor as any)?.owner_id === user.id;

  if (!isParticipant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Use close endpoint for closed status (triggers invoice)
  if (status === "closed") {
    return NextResponse.json({ error: "Use /api/deals/close for closing deals" }, { status: 400 });
  }

  await supabase.from("deals").update({ status }).eq("id", dealId);
  return NextResponse.json({ success: true });
}
