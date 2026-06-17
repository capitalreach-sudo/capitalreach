import { schedules } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase-server";
import { sendWeeklyDigest } from "@/lib/resend";

// Runs every Monday at 8am UTC
export const weeklyInvestorDigest = schedules.task({
  id: "weekly-investor-digest",
  cron: "0 8 * * 1",
  run: async () => {
    const supabase = createAdminClient();

    // Get all Angel+ investors who haven't opted out
    const { data: investors } = await supabase
      .from("investors")
      .select("id, industries, stages, owner:profiles(email, full_name)")
      .in("subscription_tier", ["angel", "pro_investor", "institutional"]);

    if (!investors || investors.length === 0) {
      console.log("No investors to digest");
      return;
    }

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let totalSent = 0;
    for (const investor of investors) {
      const ownerEmail = (investor.owner as any)?.email;
      const ownerName = (investor.owner as any)?.full_name || "there";
      if (!ownerEmail) continue;

      // Get new startups matching preferences
      let q = supabase
        .from("startups")
        .select("name, tagline, slug, industry, stage, funding_target, mrr")
        .eq("status", "active")
        .gte("created_at", oneWeekAgo)
        .order("created_at", { ascending: false })
        .limit(5);

      if (investor.industries?.length > 0) {
        q = q.in("industry", investor.industries);
      }
      if (investor.stages?.length > 0) {
        q = q.in("stage", investor.stages);
      }

      const { data: startups } = await q;
      if (!startups || startups.length === 0) continue;

      await sendWeeklyDigest(ownerEmail, ownerName, startups).catch(err =>
        console.error(`Failed to send digest to ${ownerEmail}:`, err)
      );
      totalSent++;
    }

    console.log(`Weekly digest sent to ${totalSent} investors`);
    return { sent: totalSent };
  },
});
