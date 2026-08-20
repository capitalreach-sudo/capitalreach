import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { notifyUsers } from "@/lib/notify-user";

/**
 * Complaints — distinct from content reports (E50). A report says "this
 * content breaks the rules"; a complaint says "something went wrong for ME":
 * billing, another user's conduct, a deal dispute, the platform itself.
 * Complaints get a tracked lifecycle the filer can watch (open → in_review →
 * resolved/dismissed), because a complaint that disappears into a void is
 * worse than no complaints channel at all.
 *
 * POST { category, subject, body } — file one
 * GET — your own complaints, newest first
 */
const CATEGORIES = ["platform", "user_conduct", "deal_dispute", "billing", "data_privacy", "other"] as const;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { category, subject, body } = await req.json().catch(() => ({}));
  if (!CATEGORIES.includes(category)) return NextResponse.json({ error: "Pick a category" }, { status: 400 });
  const subj = typeof subject === "string" ? subject.trim().slice(0, 200) : "";
  const text = typeof body === "string" ? body.trim().slice(0, 5000) : "";
  if (subj.length < 3) return NextResponse.json({ error: "Subject required" }, { status: 400 });
  if (text.length < 10) return NextResponse.json({ error: "Describe what happened" }, { status: 400 });

  const admin = createAdminClient();

  // Three open complaints max: enough for real concurrent grievances,
  // not enough to flood the queue.
  const { count } = await admin.from("complaints")
    .select("id", { count: "exact", head: true })
    .eq("opened_by", user.id).in("status", ["open", "in_review"]);
  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: "You already have open complaints. We will get to them." }, { status: 429 });
  }

  const { data: row, error } = await admin.from("complaints")
    .insert({ opened_by: user.id, category, subject: subj, body: text })
    .select("id").single();
  if (error || !row) return NextResponse.json({ error: "Could not file the complaint" }, { status: 500 });

  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").limit(20);
  const adminIds = (admins ?? []).map(a => a.id).filter(id => id !== user.id);
  if (adminIds.length) {
    await notifyUsers(adminIds, {
      type: "complaint_update",
      title: `Complaint filed — ${category.replace(/_/g, " ")}`,
      body: subj,
      href: "/admin",
    }).catch(() => {});
  }
  return NextResponse.json({ success: true, id: row.id });
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Own rows come through the user's own session on purpose: RLS is the
  // authority on "mine", and this route stays correct if it ever changes.
  const { data } = await supabase.from("complaints")
    .select("id, category, subject, body, status, resolution_note, created_at, resolved_at")
    .order("created_at", { ascending: false }).limit(100);
  return NextResponse.json({ complaints: data ?? [] });
}
