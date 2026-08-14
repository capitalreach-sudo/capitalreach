import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { myThreadIds } from "@/lib/threads";

/**
 * GET  -> { unread } : messages in my threads, sent by the other side, unread.
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
  if (!user) return NextResponse.json({ unread: 0 });

  const ids = await myThreadIds(user.id);
  if (!ids.length) return NextResponse.json({ unread: 0 });

  const admin = createAdminClient();
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", ids)
    .neq("sender_id", user.id)
    .is("read_at", null);

  return NextResponse.json({ unread: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await req.json();
  if (typeof threadId !== "string" || !threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }
  // Scoped to the caller's own threads -- marking someone else's thread read
  // must not be possible by guessing ids.
  const ids = await myThreadIds(user.id);
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
