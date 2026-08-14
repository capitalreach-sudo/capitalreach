import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";

/**
 * Sign-in history (login_events, migration 047).
 *
 * POST is called by the login page after a successful sign-in — including
 * after the 2FA step — with ip and user agent taken from the request headers,
 * never from the body: a record the client can compose is a record an
 * attacker can falsify.
 *
 * GET returns the caller's latest 20. GoTrue's own audit log is empty in
 * production and auth.sessions forgets a sign-in the moment it signs out;
 * this table is the durable answer to "when and from where was my account
 * accessed", which is the first thing anyone checks after a scare.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // First hop of x-forwarded-for is the client, set by Vercel's edge.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  const admin = createAdminClient();
  await admin.from("login_events").insert({ user_id: user.id, ip, user_agent: userAgent });

  // Keep the tail short in passing: 50 per user is plenty of history and
  // bounds the table without a scheduled job.
  const { data: old } = await admin
    .from("login_events")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(50, 200);
  if (old?.length) {
    await admin.from("login_events").delete().in("id", old.map((r) => r.id));
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("login_events")
    .select("id, ip, user_agent, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: "Could not load history" }, { status: 500 });
  return NextResponse.json({ logins: data ?? [] });
}
