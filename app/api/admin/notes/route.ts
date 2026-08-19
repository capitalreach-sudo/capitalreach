import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-guard";
import { isUuid } from "@/lib/utils";

/**
 * E53: what an operator KNOWS about an account.
 *
 * admin_actions has always recorded what was DONE — approved, suspended, tier
 * granted. There was nowhere to write down what was learned: "asked for an
 * extension until the 14th", "second listing, withdrew the first", "watch
 * this one, chargeback risk". That lived in somebody's head, which means it
 * left when they did.
 *
 * Notes are readable by any admin and never by the person they are about:
 * admin_notes has RLS on with no permissive policy, so the service-role
 * client behind this guard is the only way in.
 */

const TYPES = ["profile", "startup", "investor", "deal"] as const;
type TargetType = (typeof TYPES)[number];

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const targetType = req.nextUrl.searchParams.get("targetType") ?? "";
  const targetId = req.nextUrl.searchParams.get("targetId") ?? "";
  if (!TYPES.includes(targetType as TargetType) || !isUuid(targetId)) {
    return NextResponse.json({ error: "targetType and targetId required" }, { status: 400 });
  }

  const { data } = await guard.admin
    .from("admin_notes")
    // admin_id references auth.users, so there is no embed to profiles here —
    // the author names are resolved in a second read below.
    .select("id, body, created_at, admin_id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false })
    .limit(50);

  const authorIds = Array.from(new Set((data ?? []).map(n => n.admin_id).filter((id): id is string => !!id)));
  const authors = authorIds.length
    ? (await guard.admin.from("profiles").select("id, full_name, email").in("id", authorIds)).data ?? []
    : [];

  const notes = (data ?? []).map(n => {
    const a = authors.find(x => x.id === n.admin_id);
    return { ...n, authorName: a?.full_name || a?.email || null };
  });
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { targetType, targetId, body } = await req.json().catch(() => ({}));
  if (!TYPES.includes(targetType) || !isUuid(targetId ?? "")) {
    return NextResponse.json({ error: "targetType and targetId required" }, { status: 400 });
  }
  const text = typeof body === "string" && body.trim() ? body.trim().slice(0, 2000) : null;
  if (!text) return NextResponse.json({ error: "A note needs some text." }, { status: 400 });

  const { data, error } = await guard.admin
    .from("admin_notes")
    .insert({ target_type: targetType, target_id: targetId, body: text, admin_id: guard.adminId })
    .select("id, body, created_at, admin_id")
    .single();
  if (error) return NextResponse.json({ error: "Could not save the note" }, { status: 500 });

  await logAdminAction(guard.admin, guard.adminId, "note_added", targetType === "deal" ? "platform" : targetType, targetId, { noteId: data.id });
  return NextResponse.json({ note: data });
}

/** A note is a record. Only the admin who wrote it may take it back. */
export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!isUuid(id)) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: note } = await guard.admin.from("admin_notes").select("admin_id").eq("id", id).maybeSingle();
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (note.admin_id !== guard.adminId) {
    return NextResponse.json({ error: "Only the admin who wrote a note can delete it." }, { status: 403 });
  }

  const { error } = await guard.admin.from("admin_notes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not delete it" }, { status: 500 });
  return NextResponse.json({ success: true });
}
