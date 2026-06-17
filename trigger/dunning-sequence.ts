import { schedules, task } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase-server";
import { sendPaymentFailedEmail, sendViewsDigestEmail } from "@/lib/resend";
import { stripe } from "@/lib/stripe";

// Runs every day at 6am UTC — check for past-due subscriptions and send dunning emails
export const dunningSequence = schedules.task({
  id: "dunning-sequence",
  cron: "0 6 * * *",
  run: async () => {
    const supabase = createAdminClient();

    // Get profiles with past_due subscriptions
    const { data: pastDueProfiles } = await supabase
      .from("profiles")
      .select("id, email, full_name, stripe_customer_id, subscription_status")
      .eq("subscription_status", "past_due");

    if (!pastDueProfiles || pastDueProfiles.length === 0) return;

    let processed = 0;
    for (const profile of pastDueProfiles) {
      if (!profile.stripe_customer_id) continue;

      try {
        // Get the latest failed invoice from Stripe
        const invoices = await stripe.invoices.list({
          customer: profile.stripe_customer_id,
          status: "open",
          limit: 1,
        });

        const failedInvoice = invoices.data[0];
        if (!failedInvoice) continue;

        const attemptCount = failedInvoice.attempt_count;
        if (attemptCount === 0 || attemptCount > 3) continue;

        // Check when the invoice was last attempted
        const lastAttemptTime = failedInvoice.webhooks_delivered_at || failedInvoice.created;
        const daysSinceAttempt = Math.floor((Date.now() / 1000 - lastAttemptTime) / 86400);

        // Send appropriate dunning email
        if (daysSinceAttempt === 1 && attemptCount === 1) {
          await sendPaymentFailedEmail(profile.email, profile.full_name || "there", 1);
        } else if (daysSinceAttempt === 3 && attemptCount === 2) {
          await sendPaymentFailedEmail(profile.email, profile.full_name || "there", 2);
        } else if (daysSinceAttempt === 7 && attemptCount === 3) {
          await sendPaymentFailedEmail(profile.email, profile.full_name || "there", 3);
          // Suspend startup after 7 days
          await supabase
            .from("startups")
            .update({ status: "suspended" })
            .eq("owner_id", profile.id);
        }

        processed++;
      } catch (err) {
        console.error(`Dunning failed for ${profile.email}:`, err);
      }
    }

    return { processed };
  },
});

// Daily views digest — batch email to startup owners
export const dailyViewsDigest = schedules.task({
  id: "daily-views-digest",
  cron: "0 18 * * *", // 6pm UTC daily
  run: async () => {
    const supabase = createAdminClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get startups with views today
    const { data: startups } = await supabase
      .from("startups")
      .select("id, name, owner_id, owner:profiles(email)")
      .eq("status", "active");

    if (!startups) return;

    let sent = 0;
    for (const startup of startups) {
      const ownerEmail = (startup.owner as any)?.email;
      if (!ownerEmail) continue;

      const { count: viewCount } = await supabase
        .from("pageviews")
        .select("*", { count: "exact", head: true })
        .eq("startup_id", startup.id)
        .gte("created_at", today.toISOString());

      const { count: saveCount } = await supabase
        .from("watchlists")
        .select("*", { count: "exact", head: true })
        .eq("startup_id", startup.id)
        .gte("created_at", today.toISOString());

      if ((viewCount || 0) === 0 && (saveCount || 0) === 0) continue;

      await sendViewsDigestEmail(
        ownerEmail,
        startup.name,
        viewCount || 0,
        saveCount || 0
      ).catch(() => {});

      sent++;
    }

    return { sent };
  },
});
