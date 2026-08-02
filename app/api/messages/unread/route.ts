import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

/**
 * GET  -> { unread } : messages in my threads, sent by the other side, unread.
 * POST { threadId }  : mark the other side's messages in that thread read.
 *
 * "My threads" resolves through entity ownership. Team members are not
 * counted yet -- the badge understating for an associate beats a schema of
 * per-user read markers; noted as the follow-up when teams get messaging.
 */
async function myThreadIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: st }, { data: inv }] = await Promise.all([
    admin.from("startups").select("id").eq("owner_id", userId),
    admin.from("investors").select("id").eq("owner_id", userId),
  ]);
  const sIds = (st ?? []).map((r) => r.id);
  const iIds = (inv ?? []).map((r) => r.id);
  if (!sIds.length && !iIds.length) return [];
  const ors: string[] = [];
  if (sIds.length) ors.push(`startup_id.in.(${sIds.join(",")})`);
  if (iIds.length) ors.push(`investor_id.in.(${iIds.join(",")})`);
  const { data: threads } = await admin.from("threads").select("id").or(ors.join(","));
  return (threads ?? []).map((t) => t.id);
}

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
