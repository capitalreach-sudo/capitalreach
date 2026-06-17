import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generatePitchFeedback, isOpenAIConfigured } from "@/lib/openai";
import { aiRatelimit } from "@/lib/redis";

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

  const { success } = await aiRatelimit.limit(user.id);
  if (!success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { startupId } = await req.json();

  const { data: startup } = await supabase
    .from("startups")
    .select("*, owner:profiles(id, subscription_tier)")
    .eq("id", startupId)
    .single();

  if (!startup) return NextResponse.json({ error: "Startup not found" }, { status: 404 });

  // Only Growth-tier startup owners can access AI pitch feedback
  const isOwner = startup.owner_id === user.id;
  const hasAccess = isOwner && ["growth"].includes(startup.subscription_tier);
  if (!hasAccess) return NextResponse.json({ error: "Growth tier required for AI pitch feedback. Upgrade your plan to access this feature." }, { status: 403 });

  if (!startup.problem) return NextResponse.json({ error: "Complete your pitch first" }, { status: 400 });

  const feedback = await generatePitchFeedback({
    problem: startup.problem,
    solution: startup.solution || "",
    market: startup.market || "",
    competitive_advantage: startup.competitive_advantage || "",
    use_of_funds: startup.use_of_funds || "",
    funding_target: startup.funding_target,
    stage: startup.stage,
    industry: startup.industry,
  });

  // Store the report
  await supabase.from("ai_reports").insert({
    startup_id: startupId,
    type: "pitch_feedback",
    content: JSON.stringify(feedback),
  });

  return NextResponse.json(feedback);
}
