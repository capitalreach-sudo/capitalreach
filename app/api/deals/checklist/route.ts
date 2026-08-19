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
    .select("id, label, done, position, due_date, owner_side, evidence")
    .eq("deal_id", dealId)
    .order("position");
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { dealId, label, templateId } = await req.json().catch(() => ({}));
  if (!isUuid(dealId)) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  const { count } = await supabase
    .from("deal_checklist_items").select("id", { count: "exact", head: true }).eq("deal_id", dealId);
  const base = count ?? 0;

  // C30: apply a saved template — every item at once, with each item's own
  // owner and a due date derived from its offset.
  if (templateId) {
    if (!isUuid(templateId)) return NextResponse.json({ error: "invalid templateId" }, { status: 400 });
    const { data: tpl } = await supabase
      .from("investor_checklist_templates").select("items").eq("id", templateId).maybeSingle();
    if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    const items = (Array.isArray(tpl.items) ? tpl.items : []) as Array<{ label?: string; owner_side?: string; offset_days?: number }>;
    const rows = items
      .filter((i) => typeof i.label === "string" && i.label.trim())
      .slice(0, 50)
      .map((i, idx) => ({
        deal_id: dealId,
        label: String(i.label).trim().slice(0, 200),
        position: base + idx,
        owner_side: i.owner_side === "startup" || i.owner_side === "investor" ? i.owner_side : null,
        due_date: typeof i.offset_days === "number" && i.offset_days > 0
          ? new Date(Date.now() + i.offset_days * 86400000).toISOString().slice(0, 10)
          : null,
      }));
    if (!rows.length) return NextResponse.json({ error: "Template is empty" }, { status: 400 });
    const { data, error } = await supabase.from("deal_checklist_items").insert(rows).select();
    if (error) return NextResponse.json({ error: "Could not apply template" }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  }

  if (typeof label !== "string" || !label.trim() || label.length > 200) {
    return NextResponse.json({ error: "label required (max 200)" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("deal_checklist_items")
    .insert({ deal_id: dealId, label: label.trim(), position: base })
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: "Could not add" }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, done, dueDate, ownerSide, evidence } = await req.json().catch(() => ({}));
  if (!isUuid(id)) return NextResponse.json({ error: "id required" }, { status: 400 });

  // C30: an item is actionable when it says who owes it, by when, and what
  // proved it — not just whether a box is ticked.
  const patch: { done?: boolean; due_date?: string | null; owner_side?: string | null; evidence?: string | null } = {};
  if (done !== undefined) {
    if (typeof done !== "boolean") return NextResponse.json({ error: "done must be a boolean" }, { status: 400 });
    patch.done = done;
  }
  if (dueDate !== undefined) {
    if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate))) return NextResponse.json({ error: "invalid dueDate" }, { status: 400 });
    patch.due_date = dueDate;
  }
  if (ownerSide !== undefined) {
    if (ownerSide !== null && ownerSide !== "startup" && ownerSide !== "investor") return NextResponse.json({ error: "invalid ownerSide" }, { status: 400 });
    patch.owner_side = ownerSide;
  }
  if (evidence !== undefined) {
    patch.evidence = typeof evidence === "string" && evidence.trim() ? evidence.trim().slice(0, 500) : null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await supabase.from("deal_checklist_items").update(patch).eq("id", id);
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
