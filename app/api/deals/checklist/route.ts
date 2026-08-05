import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";

/**
 * Due-diligence checklist on a deal (migration 041). Everything runs on the
 * caller's own client: the table's RLS inherits deal visibility, so whoever
 * can see the deal can manage its checklist -- owner, team member, admin.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!isUuid(dealId)) return NextResponse.json({ error: "dealId required" }, { status: 400 });
  const { data } = await supabase
    .from("deal_checklist_items")
    .select("id, label, done, position")
    .eq("deal_id", dealId)
    .order("position");
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { dealId, label } = await req.json().catch(() => ({}));
  if (!isUuid(dealId)) return NextResponse.json({ error: "dealId required" }, { status: 400 });
  if (typeof label !== "string" || !label.trim() || label.length > 200) {
    return NextResponse.json({ error: "label required (max 200)" }, { status: 400 });
  }
  const { count } = await supabase
    .from("deal_checklist_items").select("id", { count: "exact", head: true }).eq("deal_id", dealId);
  const { data, error } = await supabase
    .from("deal_checklist_items")
    .insert({ deal_id: dealId, label: label.trim(), position: (count ?? 0) })
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: "Could not add" }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, done } = await req.json().catch(() => ({}));
  if (!isUuid(id) || typeof done !== "boolean") {
    return NextResponse.json({ error: "id and done required" }, { status: 400 });
  }
  const { error } = await supabase.from("deal_checklist_items").update({ done }).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not update" }, { status: 500 });
  return NextResponse.json({ updated: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!isUuid(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("deal_checklist_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
