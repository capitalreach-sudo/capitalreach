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
  // Optional type filter (the page's tabs). Values are intersected with the
  // known union so nothing user-supplied reaches the query as a surprise;
  // an empty intersection means no filter rather than an empty feed.
  const KNOWN_TYPES = new Set([
    "deal_opened", "deal_stage", "deal_closed", "deal_passed",
    "message", "follow_up_due", "contract_status", "nda_signed",
    "listing_approved", "listing_rejected", "team_added",
    "tier_changed", "search_match", "listing_saved", "listing_update",
  ]);
  const types = (req.nextUrl.searchParams.get("types") ?? "")
    .split(",").map((t) => t.trim()).filter((t) => KNOWN_TYPES.has(t));
  // Cursor pagination: pass the created_at AND id of the last row you have.
  // The cursor must be composite -- rows inserted in one transaction share a
  // created_at (Postgres now() is per-transaction), so a timestamp-only
  // `lt` skips every tied row and the page after a batch comes back empty.
  // Both parts are user input, so they are validated before being embedded
  // in the or() filter string.
  const before = req.nextUrl.searchParams.get("before");
  const beforeId = req.nextUrl.searchParams.get("beforeId");
  const validBefore = before && !Number.isNaN(Date.parse(before)) ? before : null;
  const validBeforeId =
    beforeId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(beforeId)
      ? beforeId
      : null;

  let query = supabase
    .from("notifications")
    .select("id, type, title, body, href, read_at, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(30);

  if (unreadOnly) query = query.is("read_at", null);
  if (types.length > 0) query = query.in("type", types);
  if (validBefore && validBeforeId) {
    query = query.or(
      `created_at.lt.${validBefore},and(created_at.eq.${validBefore},id.lt.${validBeforeId})`
    );
  } else if (validBefore) {
    query = query.lt("created_at", validBefore);
  }

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
