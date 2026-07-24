import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { apiRatelimit } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "Missing dealId" }, { status: 400 });

  const admin = createAdminClient();

  const { data: deal } = await admin
    .from("deals")
    .select("id, startup_id, investor_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const [{ data: startup }, { data: investor }, { data: profile }] = await Promise.all([
    admin.from("startups").select("id, owner_id").eq("id", deal.startup_id).maybeSingle(),
    admin.from("investors").select("id, owner_id").eq("id", deal.investor_id).maybeSingle(),
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  const isParticipant = startup?.owner_id === user.id || investor?.owner_id === user.id;
  if (!isParticipant && profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: activity, error } = await admin
    .from("deal_activity")
    .select("id, type, body, created_at, actor:profiles(full_name)")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });

  return NextResponse.json({ activity: activity ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { success } = await apiRatelimit.limit(user.id);
    if (!success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  } catch {
    // Redis unavailable — fail open and allow the request through
  }

  const { dealId, body } = await req.json();
  if (!dealId || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "Missing deal or note" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: deal } = await admin
    .from("deals")
    .select("id, startup_id, investor_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const [{ data: startup }, { data: investor }, { data: profile }] = await Promise.all([
    admin.from("startups").select("id, owner_id").eq("id", deal.startup_id).maybeSingle(),
    admin.from("investors").select("id, owner_id").eq("id", deal.investor_id).maybeSingle(),
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  const isParticipant = startup?.owner_id === user.id || investor?.owner_id === user.id;
  if (!isParticipant && profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: entry, error } = await admin
    .from("deal_activity")
    .insert({
      deal_id: deal.id,
      startup_id: deal.startup_id,
      investor_id: deal.investor_id,
      actor_id: user.id,
      type: "note",
      body: body.trim(),
    })
    .select("id, type, body, created_at, actor:profiles(full_name)")
    .single();
  if (error || !entry) return NextResponse.json({ error: "Failed to add note" }, { status: 500 });

  return NextResponse.json({ success: true, entry });
}
