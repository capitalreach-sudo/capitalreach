import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dealId, status, reason } = await req.json();

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  // Verify participant (or admin, who can manage any deal for oversight)
  const { data: deal } = await supabase
    .from("deals")
    .select("startup_id, investor_id, startup:startups(owner_id), investor:investors(owner_id)")
    .eq("id", dealId)
    .single();

  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isParticipant =
    (deal.startup as any)?.owner_id === user.id ||
    (deal.investor as any)?.owner_id === user.id;

  if (!isParticipant && profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Use close endpoint for closed status (triggers invoice)
  if (status === "closed") {
    return NextResponse.json({ error: "Use /api/deals/close for closing deals" }, { status: 400 });
  }

  await supabase.from("deals").update({ status }).eq("id", dealId);

  // deal_activity has no admin RLS policy (unlike deals), so use the admin
  // client here to make sure admin-initiated changes still get logged.
  const admin = createAdminClient();
  await admin.from("deal_activity").insert({
    deal_id: dealId,
    startup_id: deal.startup_id,
    investor_id: deal.investor_id,
    actor_id: user.id,
    type: "status_change",
    body: status === "passed" && typeof reason === "string" && reason.trim() ? reason.trim() : null,
  });

  return NextResponse.json({ success: true });
}
