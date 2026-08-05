import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { resolveEntity } from "@/lib/membership";
import { notifyUser } from "@/lib/notify-user";
import { isUuid } from "@/lib/utils";

/**
 * Listing Q&A (migration 038). POST asks (investors), PATCH answers
 * (founder/team). Reads happen via RLS on the profile: answered rows are
 * public, unanswered visible to asker and founder only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { startupId, question } = await req.json().catch(() => ({}));
  if (!isUuid(startupId)) return NextResponse.json({ error: "startupId required" }, { status: 400 });
  if (typeof question !== "string" || question.trim().length < 10 || question.length > 1000) {
    return NextResponse.json({ error: "question must be 10–1000 chars" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: inv }, { data: startup }] = await Promise.all([
    admin.from("investors").select("id, display_name, firm_name").eq("owner_id", user.id).maybeSingle(),
    admin.from("startups").select("owner_id, name, slug, status").eq("id", startupId).maybeSingle(),
  ]);
  if (!inv) return NextResponse.json({ error: "Investors only" }, { status: 403 });
  if (!startup || startup.status !== "active") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: q, error } = await admin
    .from("listing_questions")
    .insert({ startup_id: startupId, investor_id: inv.id, question: question.trim() })
    .select()
    .single();
  if (error || !q) return NextResponse.json({ error: "Could not ask" }, { status: 500 });

  await notifyUser({
    userId: startup.owner_id,
    type: "question_asked",
    title: `${inv.display_name ?? inv.firm_name ?? "An investor"} asked a question on ${startup.name}`,
    body: question.trim().slice(0, 140),
    href: `/startups/${startup.slug}`,
  });
  return NextResponse.json({ question: q });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, answer } = await req.json().catch(() => ({}));
  if (!isUuid(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (typeof answer !== "string" || !answer.trim() || answer.length > 3000) {
    return NextResponse.json({ error: "answer required (max 3000 chars)" }, { status: 400 });
  }

  const membership = await resolveEntity(user.id, "startup");
  if (!membership) return NextResponse.json({ error: "Founders only" }, { status: 403 });

  const admin = createAdminClient();
  const { data: q, error } = await admin
    .from("listing_questions")
    .update({ answer: answer.trim(), answered_at: new Date().toISOString() })
    .eq("id", id)
    .eq("startup_id", membership.entityId)
    .select("id, investor_id, startup:startups(name, slug)")
    .single();
  if (error || !q) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: asker } = await admin
    .from("investors").select("owner_id").eq("id", q.investor_id).maybeSingle();
  if (asker?.owner_id) {
    const st: any = q.startup;
    await notifyUser({
      userId: asker.owner_id,
      type: "question_answered",
      title: `${st?.name ?? "A founder"} answered your question`,
      body: answer.trim().slice(0, 140),
      href: st?.slug ? `/startups/${st.slug}` : null,
    });
  }
  return NextResponse.json({ answered: true });
}
