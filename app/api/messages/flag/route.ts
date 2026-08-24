import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { myThreadIds } from "@/lib/threads";
import { isUuid } from "@/lib/utils";

/**
 * The importance marker: YOUR star on a conversation, invisible to the
 * other side. Membership is checked against the shared thread rule; the
 * write itself goes through the caller's own session so RLS's own-row
 * policy stays the final authority.
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId, important } = await req.json().catch(() => ({}));
  if (!isUuid(threadId ?? "") || typeof important !== "boolean") {
    return NextResponse.json({ error: "threadId and important required" }, { status: 400 });
  }
  const mine = await myThreadIds(user.id);
  if (!mine.includes(threadId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (important) {
    const { error } = await supabase.from("thread_flags")
      .upsert({ thread_id: threadId, user_id: user.id, important: true });
    if (error) return NextResponse.json({ error: "Could not flag" }, { status: 500 });
  } else {
    await supabase.from("thread_flags").delete().match({ thread_id: threadId, user_id: user.id });
  }
  return NextResponse.json({ important });
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase.from("thread_flags").select("thread_id").eq("important", true);
  return NextResponse.json({ threadIds: (data ?? []).map(r => r.thread_id) });
}
