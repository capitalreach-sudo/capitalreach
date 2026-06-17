import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { scoreStartup, isOpenAIConfigured } from "@/lib/openai";
import { cacheStartupScore } from "@/lib/redis";

// Called by Trigger.dev background job OR admin approve route
export async function POST(req: NextRequest) {
  if (!isOpenAIConfigured) {
    return NextResponse.json({ error: "OpenAI not configured" }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.TRIGGER_SECRET_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { startupId } = await req.json();
  const supabase = createAdminClient();

  const { data: startup } = await supabase
    .from("startups")
    .select("*, founders:startup_founders(*), documents:startup_documents(*), milestones:startup_milestones(*)")
    .eq("id", startupId)
    .single();

  if (!startup) return NextResponse.json({ error: "Startup not found" }, { status: 404 });

  const score = await scoreStartup({
    name: startup.name,
    problem: startup.problem,
    solution: startup.solution,
    market: startup.market,
    competitive_advantage: startup.competitive_advantage,
    mrr: startup.mrr,
    arr: startup.arr,
    user_count: startup.user_count,
    growth_rate: startup.growth_rate,
    founders: startup.founders,
    documents: startup.documents,
    milestones: startup.milestones,
    stage: startup.stage,
  });

  await supabase.from("startups").update({ vaultrise_score: score }).eq("id", startupId);
  await cacheStartupScore(startupId, score);

  return NextResponse.json({ score });
}
