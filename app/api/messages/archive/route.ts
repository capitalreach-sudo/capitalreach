import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/utils";
import { myThreadIds } from "@/lib/threads";

/**
 * Per-user thread archive (thread_archives, migration 052).
 *
 * GET    → the caller's archived thread ids.
 * POST   { threadId } → archive it for the caller only.
 * DELETE { threadId } → unarchive.
 *
 * Membership goes through lib/threads like every other message operation —
 * archiving a thread you can guess the id of must not reveal that it exists.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("thread_archives").select("thread_id").eq("user_id", user.id);
  return NextResponse.json({ archived: (data ?? []).map((r) => r.thread_id) });
}

async function mutate(req: NextRequest, action: "archive" | "unarchive") {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await req.json().catch(() => ({}));
  if (!isUuid(threadId)) return NextResponse.json({ error: "threadId required" }, { status: 400 });

  const ids = await myThreadIds(user.id);
  if (!ids.includes(threadId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  if (action === "archive") {
    // Upsert: archiving twice is idempotent, not an error.
    const { error } = await admin
      .from("thread_archives")
      .upsert({ thread_id: threadId, user_id: user.id }, { onConflict: "thread_id,user_id" });
    if (error) return NextResponse.json({ error: "Could not archive" }, { status: 500 });
  } else {
    const { error } = await admin
      .from("thread_archives").delete().eq("thread_id", threadId).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Could not unarchive" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) { return mutate(req, "archive"); }
export async function DELETE(req: NextRequest) { return mutate(req, "unarchive"); }
