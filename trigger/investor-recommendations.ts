import { schedules } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase-server";
import { matchStartupsToInvestor } from "@/lib/openai";
import { resend } from "@/lib/resend";
import { env } from "@/lib/env";
import { getInvestorPlan } from "@/lib/plans";

// Runs every day at 9am UTC — refresh recommendations for Pro+ investors
export const investorRecommendations = schedules.task({
  id: "investor-recommendations",
  cron: "0 9 * * *",
  run: async () => {
    const supabase = createAdminClient();

    // Only Pro+ investors get daily AI recommendations. Filtered in memory
    // through getInvestorPlan (lib/plans.ts), the single source of truth for
    // tier ids -- a DB-side .in(["pro_investor","institutional"]) hardcoded
    // legacy strings the Stripe webhook stopped writing (canonical ids are
    // "pro"/"institution"), so this job matched nobody and never ran.
    const { data: allInvestors } = await supabase
      .from("investors")
      .select("id, industries, stages, min_check, max_check, geography, subscription_tier, owner:profiles(email, full_name)");

    const investors = (allInvestors ?? []).filter((inv) => {
      const plan = getInvestorPlan(inv.subscription_tier).id;
      return plan === "pro" || plan === "institution";
    });

    if (investors.length === 0) return;

    const { data: activeStartups } = await supabase
      .from("startups")
      .select("id, name, slug, tagline, industry, stage, country, funding_target, mrr")
      .eq("status", "active")
      .limit(100);

    if (!activeStartups || activeStartups.length === 0) return;

    let processed = 0;
    for (const investor of investors) {
      try {
        const matchedIds = await matchStartupsToInvestor(
          {
            industries: investor.industries || [],
            stages: investor.stages || [],
            min_check: investor.min_check,
            max_check: investor.max_check,
            geography: investor.geography || [],
          },
          activeStartups
        );

        if (matchedIds.length === 0) continue;

        const matches = matchedIds
          .slice(0, 5)
          .map(id => activeStartups.find(s => s.id === id))
          .filter(Boolean) as typeof activeStartups;

        // Store recommendations in a simple way (could use a recommendations table)
        // For now, update a JSONB field or just send the email
        const ownerEmail = (investor.owner as any)?.email;
        const ownerName = (investor.owner as any)?.full_name || "there";

        if (ownerEmail && matches.length > 0) {
          const startupLinks = matches
            .map(s => `<li><a href="${process.env.NEXT_PUBLIC_APP_URL}/startups/${(s as any).slug}">${s!.name}</a> — ${s!.tagline}</li>`)
            .join("");

          await resend.emails.send({
            from: env.resend.fromEmail,
            to: ownerEmail,
            subject: `Today's recommended startups for you`,
            html: `
              <h2>Good morning, ${ownerName}!</h2>
              <p>Based on your investment preferences, here are today's top picks:</p>
              <ul style="line-height:1.8">${startupLinks}</ul>
              <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">Browse all startups →</a></p>
            `,
          }).catch(() => {});
        }

        processed++;
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.error(`Failed to process investor ${investor.id}:`, err);
      }
    }

    return { processed, total: investors.length };
  },
});
