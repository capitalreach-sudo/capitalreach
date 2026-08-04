import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { resolveEntity } from "@/lib/membership";
import { isUuid } from "@/lib/utils";

/**
 * The founder's target list: investors this startup wants in the round.
 * Mirror of the investor watchlist (migration 031). GET lists, POST saves or
 * updates the note, DELETE removes.
 *
 * Reads and writes go through the service role after resolveEntity, so team
 * members can manage the raise alongside the owner -- the RLS policy alone
 * only covers the owner, same split as the watchlist/savers routes.
 */

async function callerStartup(userId: string) {
  const membership = await resolveEntity(userId, "startup");
  return membership?.entityId ?? null;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startupId = await callerStartup(user.id);
  if (!startupId) return NextResponse.json({ targets: [] });

  const admin = createAdminClient();
  const { data } = await admin
    .from("investor_targets")
    .select("id, note, created_at, investor:investors(slug, display_name, firm_name, type)")
    .eq("startup_id", startupId)
    .order("created_at", { ascending: false })
    .limit(100);

  const targets = (data ?? [])
    .map((r: any) => ({
      id: r.id,
      note: r.note,
      createdAt: r.created_at,
      slug: r.investor?.slug ?? null,
      name: r.investor?.display_name ?? r.investor?.firm_name ?? null,
      firm: r.investor?.firm_name ?? null,
      type: r.investor?.type ?? null,
    }))
    .filter((t) => t.slug);

  return NextResponse.json({ targets });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investorId, note } = await req.json().catch(() => ({}));
  if (!isUuid(investorId)) return NextResponse.json({ error: "investorId required" }, { status: 400 });

  const startupId = await callerStartup(user.id);
  if (!startupId) {
    return NextResponse.json({ error: "Only founders can target investors." }, { status: 403 });
  }

  const admin = createAdminClient();
  const row: import("@/types/supabase").Database["public"]["Tables"]["investor_targets"]["Insert"] =
    { startup_id: startupId, investor_id: investorId };
  // Same note semantics as the watchlist: only sent keys write, so re-saving
  // without a note never wipes one.
  if (note !== undefined) {
    row.note = typeof note === "string" && note.trim() ? note.trim().slice(0, 1000) : null;
  }

  const { error } = await admin
    .from("investor_targets")
    .upsert(row, { onConflict: "startup_id,investor_id" });

  if (error) {
    // 23503: the investor id doesn't exist -- caller's error, not ours.
    if (error.code === "23503") {
      return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    }
    console.error("target upsert failed:", error);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
  return NextResponse.json({ targeted: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investorId } = await req.json().catch(() => ({}));
  if (!isUuid(investorId)) return NextResponse.json({ error: "investorId required" }, { status: 400 });

  const startupId = await callerStartup(user.id);
  if (!startupId) return NextResponse.json({ targeted: false });

  const admin = createAdminClient();
  const { error } = await admin
    .from("investor_targets")
    .delete()
    .eq("startup_id", startupId)
    .eq("investor_id", investorId);

  if (error) {
    console.error("target delete failed:", error);
    return NextResponse.json({ error: "Could not remove" }, { status: 500 });
  }
  return NextResponse.json({ targeted: false });
}
