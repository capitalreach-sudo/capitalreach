import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

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

  const { data: contracts, error } = await admin
    .from("contracts")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Failed to load contracts" }, { status: 500 });

  return NextResponse.json({ contracts: contracts ?? [] });
}
