import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { generateDueDiligenceReport, isOpenAIConfigured } from "@/lib/openai";
import { aiRatelimit } from "@/lib/redis";
import { getLaunchStatus } from "@/lib/launchMode";
import { buildAccessContext, canAiDueDiligence } from "@/lib/access";

export async function POST(req: NextRequest) {
  if (!isOpenAIConfigured) {
    return NextResponse.json(
      { error: "AI features are not configured. Add OPENAI_API_KEY to your environment." },
      { status: 503 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { success } = await aiRatelimit.limit(user.id);
    if (!success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  } catch {
    // Redis unavailable — fail open and allow the request through
  }

  const { startupId } = await req.json();

  const [profileRes, startupRes, { isLaunch }] = await Promise.all([
    supabase.from("profiles").select("id, role, subscription_tier").eq("id", user.id).single(),
    supabase
      .from("startups")
      .select("*, founders:startup_founders(*), documents:startup_documents(*)")
      .eq("id", startupId)
      .single(),
    getLaunchStatus(),
  ]);

  const profile = profileRes.data;
  const startup = startupRes.data;
  if (!startup) return NextResponse.json({ error: "Startup not found" }, { status: 404 });

  const ctx = buildAccessContext(profile, isLaunch);
  if (!canAiDueDiligence(ctx)) {
    return NextResponse.json(
      { error: "Upgrade to Pro Investor for AI due diligence reports." },
      { status: 403 }
    );
  }

  const { data: investor } = await supabase
    .from("investors")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  const report = await generateDueDiligenceReport({
    name: startup.name,
    tagline: startup.tagline,
    industry: startup.industry,
    stage: startup.stage,
    country: startup.country,
    problem: startup.problem,
    solution: startup.solution,
    market: startup.market,
    competitive_advantage: startup.competitive_advantage,
    mrr: startup.mrr,
    arr: startup.arr,
    user_count: startup.user_count,
    growth_rate: startup.growth_rate,
    funding_target: startup.funding_target,
    equity_offered: startup.equity_offered,
    founders: startup.founders,
  });

  const adminClient = createAdminClient();
  await adminClient.from("ai_reports").insert({
    investor_id: investor?.id,
    startup_id: startupId,
    type: "due_diligence",
    content: report,
  });

  return NextResponse.json({ report });
}
