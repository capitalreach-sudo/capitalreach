import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";

/**
 * C30: an investor's reusable diligence checklists. Saved per investor and
 * applied to any deal in one action, so the same twelve questions don't get
 * retyped for every company. RLS scopes every row to the owner.
 *
 * GET → your templates · POST { name, items[] } → save · DELETE { id }
 */
async function investorId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string) {
  const { data } = await supabase.from("investors").select("id").eq("owner_id", userId).maybeSingle();
  return data?.id ?? null;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const invId = await investorId(supabase, user.id);
  if (!invId) return NextResponse.json({ templates: [] });
  const { data } = await supabase
    .from("investor_checklist_templates")
    .select("id, name, items, is_default, created_at")
    .eq("investor_id", invId)
    .order("created_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const invId = await investorId(supabase, user.id);
  if (!invId) return NextResponse.json({ error: "Investors only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const items = (Array.isArray(body.items) ? body.items : [])
    .map((i: unknown) => {
      if (typeof i === "string") return { label: i.trim().slice(0, 200) };
      if (i && typeof i === "object") {
        const o = i as { label?: unknown; owner_side?: unknown; offset_days?: unknown };
        if (typeof o.label !== "string" || !o.label.trim()) return null;
        return {
          label: o.label.trim().slice(0, 200),
          owner_side: o.owner_side === "startup" || o.owner_side === "investor" ? o.owner_side : undefined,
          offset_days: typeof o.offset_days === "number" && o.offset_days > 0 && o.offset_days <= 365 ? Math.round(o.offset_days) : undefined,
        };
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 50);
  if (items.length === 0) return NextResponse.json({ error: "At least one item is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("investor_checklist_templates")
    .insert({ investor_id: invId, name, items })
    .select("id, name, items, is_default, created_at")
    .single();
  if (error || !data) return NextResponse.json({ error: "Could not save template" }, { status: 500 });
  return NextResponse.json({ template: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!isUuid(id ?? "")) return NextResponse.json({ error: "id required" }, { status: 400 });
  const invId = await investorId(supabase, user.id);
  if (!invId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { error } = await supabase.from("investor_checklist_templates").delete().match({ id, investor_id: invId });
  if (error) return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
