import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { messagingAvailable } from "@/lib/messaging-access";

/**
 * The signed-in user's notifications.
 *
 * GET returns the most recent slice plus an unread count -- the count is what
 * the navbar badge renders, and it is deliberately part of the same response
 * so opening a page costs one request rather than two.
 *
 * Messaging exists only after a sealed deal (lib/messaging-access). Until the
 * member has Messages, GET withholds every "message" row and every row linking
 * into /dashboard/messages, from the feed and from the unread count alike.
 * PATCH and DELETE are deliberately not scoped that way: a withheld row must
 * stay markable and removable, or it could never leave the unread state.
 *
 * PATCH marks read: one id, or all of them.
 */

// Notification ids are uuids; anything else is rejected before it reaches a
// query. Shared by GET's cursor, DELETE and PATCH so the three cannot drift.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// NOT LIKE on a NULL href is NULL, which would also drop every row without a
// link, so the NULL arm is explicit. `*` is PostgREST's LIKE wildcard.
const OUTSIDE_INBOX = "href.is.null,href.not.like./dashboard/messages*";
// Deal-note @mentions are raised with type "message" but link to /deals, where
// every party already belongs; only inbox messages are withheld.
const MESSAGE_ONLY_ON_DEALS = "type.neq.message,href.like./deals*";

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
    "doc_request", "deal_shared", "question_asked", "question_answered", "verified",
    // The six that were MISSING: their tabs intersected to empty, and an
    // empty intersection means "no filter" -- so the admin Platform tab
    // silently showed the entire feed and sealed-deal alerts were
    // unreachable in the Deals tab.
    "interest", "fee_due", "complaint_update", "admin_alert", "deal_sealed", "deal_seal_pending",
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
  const validBeforeId = beforeId && UUID_RE.test(beforeId) ? beforeId : null;

  // Filtered in the query rather than after it, so a page of 30 stays 30 and
  // the load-more cursor still sees a full page when more rows exist.
  const withholdMessaging = !(await messagingAvailable(user.id));

  let query = supabase
    .from("notifications")
    .select("id, type, title, body, href, read_at, created_at, title_key, body_key, params")
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

  let unreadQuery = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  // or() appends a second `or` parameter, which PostgREST ANDs with the
  // cursor's or() above rather than replacing it.
  if (withholdMessaging) {
    query = query.or(MESSAGE_ONLY_ON_DEALS).or(OUTSIDE_INBOX);
    unreadQuery = unreadQuery.or(MESSAGE_ONLY_ON_DEALS).or(OUTSIDE_INBOX);
  }

  const [{ data: rows }, { count }] = await Promise.all([query, unreadQuery]);

  return NextResponse.json({ notifications: rows ?? [], unread: count ?? 0 });
}

/**
 * Remove notifications: one by id, or every already-read row ("clear read").
 * RLS scopes the delete to the caller; the user_id filter states it anyway.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, allRead } = await req.json().catch(() => ({}));

  if (allRead === true) {
    const { error } = await supabase
      .from("notifications").delete().eq("user_id", user.id).not("read_at", "is", null);
    if (error) return NextResponse.json({ error: "Could not clear" }, { status: 500 });
    return NextResponse.json({ cleared: true });
  }

  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const { error } = await supabase
    .from("notifications").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not delete" }, { status: 500 });
  return NextResponse.json({ deleted: true });
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
    // Same shape gate as DELETE: a malformed id must be a 400, not a 500 out
    // of PostgREST when the uuid cast fails.
    if (typeof id !== "string" || !UUID_RE.test(id)) {
      return NextResponse.json({ error: "id or all required" }, { status: 400 });
    }
    q = q.eq("id", id);
  }

  const { error } = await q;
  if (error) return NextResponse.json({ error: "Could not mark read" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
