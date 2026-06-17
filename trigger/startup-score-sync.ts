import { schedules } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase-server";
import { scoreStartup } from "@/lib/openai";

// Runs every day at 2am UTC — re-score all active startups
export const startupScoreSync = schedules.task({
  id: "startup-score-sync",
  cron: "0 2 * * *",
  run: async () => {
    const supabase = createAdminClient();

    const { data: startups } = await supabase
      .from("startups")
      .select(`
        id, name, problem, solution, market, competitive_advantage,
        mrr, arr, user_count, growth_rate, stage,
        founders:startup_founders(name, role, linkedin_url),
        documents:startup_documents(type),
        milestones:startup_milestones(description)
      `)
      .eq("status", "active");

    if (!startups || startups.length === 0) {
      console.log("No active startups to score");
      return;
    }

    let scored = 0;
    for (const startup of startups) {
      try {
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
          founders: (startup.founders as any) || [],
          documents: (startup.documents as any) || [],
          milestones: (startup.milestones as any) || [],
          stage: startup.stage,
        });

        await supabase
          .from("startups")
          .update({ vaultrise_score: score })
          .eq("id", startup.id);

        scored++;
        // Small delay to avoid OpenAI rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`Failed to score startup ${startup.id}:`, err);
      }
    }

    console.log(`Scored ${scored}/${startups.length} startups`);
    return { scored, total: startups.length };
  },
});
