import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { sendListingLiveEmail } from "@/lib/resend";
import { scoreStartup, isOpenAIConfigured } from "@/lib/openai";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const { startupId } = await req.json();
  const adminClient = createAdminClient();

  const { data: startup } = await adminClient
    .from("startups")
    .select("*, founders:startup_founders(*), documents:startup_documents(*), milestones:startup_milestones(*), owner:profiles(email, full_name)")
    .eq("id", startupId)
    .single();

  if (!startup) return NextResponse.json({ error: "Startup not found" }, { status: 404 });

  // Approve and set active
  await adminClient
    .from("startups")
    .update({ status: "active" })
    .eq("id", startupId);

  // Log admin action
  await adminClient.from("admin_actions").insert({
    admin_id: user.id,
    target_id: startupId,
    target_type: "startup",
    action: "approve",
  });

  // Kick off AI scoring in background (best-effort — skipped if OpenAI not configured)
  if (isOpenAIConfigured) {
    scoreStartup({
      name: startup.name,
      problem: startup.problem,
      solution: startup.solution,
      market: startup.market,
      competitive_advantage: startup.competitive_advantage,
      mrr: startup.mrr,
      arr: startup.arr,
      user_count: startup.user_count,
      growth_rate: startup.growth_rate,
      founders: startup.founders || [],
      documents: startup.documents || [],
      milestones: startup.milestones || [],
      stage: startup.stage,
    }).then(score =>
      adminClient.from("startups").update({ vaultrise_score: score }).eq("id", startupId)
    ).catch(() => {});
  }

  // Send approval email
  const ownerEmail = (startup.owner as any)?.email;
  if (ownerEmail) {
    await sendListingLiveEmail(
      ownerEmail,
      startup.name,
      startup.slug
    ).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
