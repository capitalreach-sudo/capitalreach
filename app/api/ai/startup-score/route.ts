import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { scoreStartup, isOpenAIConfigured } from "@/lib/openai";
import { cacheStartupScore } from "@/lib/redis";
import { optionalEnv } from "@/lib/env";

// Called by Trigger.dev background job OR admin approve route
export async function POST(req: NextRequest) {
  // Fail closed on a missing secret, matching /api/cron/follow-ups.
  //
  // This compared against `Bearer ${process.env.TRIGGER_SECRET_KEY}` directly,
  // so with the variable unset the expected header was the literal string
  // "Bearer undefined" and anyone sending that got in. The route calls GPT on
  // our account and writes with the service-role client, so an open door here
  // both costs money and touches data.
  //
  // optionalEnv rather than process.env because it also rejects placeholder
  // values, which ship in .env.example and are therefore public.
  const secret = optionalEnv("TRIGGER_SECRET_KEY");
  if (!secret) {
    console.error("[ai/startup-score] TRIGGER_SECRET_KEY is not set — refusing to run.");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Deliberately after the auth check: an unauthenticated caller should not be
  // able to probe which integrations are configured.
  if (!isOpenAIConfigured) {
    return NextResponse.json({ error: "OpenAI not configured" }, { status: 503 });
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
