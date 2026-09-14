import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { messagingAccess, usableThreadIds } from "@/lib/messaging-access";

/**
 * GET  -> { unread, available }
 *   available: whether this user has Messages at all (lib/messaging-access).
 *     Every inbox entry point learns it from this call, so hiding them costs
 *     no request of its own.
 *   unread: messages the other side sent and nobody on this side has read,
 *     counted only in threads this user may still use. For a member that is
 *     sealed-pair threads alone: a thread they cannot open must not ring a
 *     badge they cannot clear.
 * POST { threadId }  : mark the other side's messages in that thread read.
 *
 * Membership resolution lives in lib/threads (shared with the attachment
 * routes, and where the recipient_startup_id fix is documented).
 *
 * "My threads" resolves through entity ownership plus team membership, so
 * an associate sees the firm's unread mail. Read state stays one-per-side
 * (a member reading counts as the side having read), consistent with the
 * team model everywhere else.
 */

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ unread: 0, available: false });

  const access = await messagingAccess(user.id);
  const available = access.admin || access.pairs.length > 0;
  if (!available) return NextResponse.json({ unread: 0, available });

  const ids = await usableThreadIds(user.id, access);
  if (!ids.length) return NextResponse.json({ unread: 0, available });

  const admin = createAdminClient();
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", ids)
    .neq("sender_id", user.id)
    .is("read_at", null);

  return NextResponse.json({ unread: count ?? 0, available });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await req.json().catch(() => ({}));
  if (typeof threadId !== "string" || !threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }
  // Scoped to threads the caller may still use -- marking someone else's
  // thread read must not be possible by guessing ids, and a read receipt from
  // a member into a thread they cannot open is contact the rule withholds.
  const ids = await usableThreadIds(user.id, await messagingAccess(user.id));
  if (!ids.includes(threadId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  await admin
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .neq("sender_id", user.id)
    .is("read_at", null);

  return NextResponse.json({ ok: true });
}
