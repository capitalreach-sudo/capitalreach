import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * The signed-in user's notifications.
 *
 * GET returns the most recent slice plus an unread count -- the count is what
 * the navbar badge renders, and it is deliberately part of the same response
 * so opening a page costs one request rather than two.
 *
 * PATCH marks read: one id, or all of them.
 */

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";

  let query = supabase
    .from("notifications")
    .select("id, type, title, body, href, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (unreadOnly) query = query.is("read_at", null);

  const [{ data: rows }, { count }] = await Promise.all([
    query,
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  return NextResponse.json({ notifications: rows ?? [], unread: count ?? 0 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, all } = await req.json().catch(() => ({}));

  // RLS already scopes updates to the owner, but the user_id filter is stated
  // here too: a write that depends solely on a policy is one policy edit away
  // from touching someone else's rows.
  let q = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (!all) {
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "id or all required" }, { status: 400 });
    }
    q = q.eq("id", id);
  }

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
