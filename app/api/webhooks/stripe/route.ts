import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent, TIER_MAP } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase-server";
import { incrementMemberCount } from "@/lib/launchMode";
import { sendPaymentFailedEmail, sendSubscriptionCancelledEmail } from "@/lib/resend";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.arrayBuffer();
  const sig  = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(Buffer.from(body), sig);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {

      // ── Subscription created / updated ──────────────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub     = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price.id;
        const tier    = priceId ? TIER_MAP[priceId] : undefined;
        if (!tier) break;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, role")
          .eq("stripe_customer_id", sub.customer as string)
          .single();

        if (!profile) break;

        await supabase
          .from("profiles")
          .update({
            subscription_tier:      tier,
            subscription_status:    sub.status,
            stripe_subscription_id: sub.id,
          })
          .eq("id", profile.id);

        const isStartupTier = ["starter", "growth"].includes(tier);
        if (isStartupTier) {
          await supabase
            .from("startups")
            .update({ subscription_tier: tier })
            .eq("owner_id", profile.id);
        } else {
          await supabase
            .from("investors")
            .update({ subscription_tier: tier })
            .eq("owner_id", profile.id);
        }

        // Increment launch-mode member counter on first subscription
        if (event.type === "customer.subscription.created") {
          await incrementMemberCount().catch(() => {});
        }
        break;
      }

      // ── Subscription cancelled ───────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, email, full_name, role, subscription_tier")
          .eq("stripe_customer_id", sub.customer as string)
          .single();

        if (!profile) break;

        await supabase
          .from("profiles")
          .update({
            subscription_tier:      "free",
            subscription_status:    "cancelled",
            stripe_subscription_id: null,
          })
          .eq("id", profile.id);

        if (profile.role === "startup") {
          await supabase.from("startups").update({ subscription_tier: "free" }).eq("owner_id", profile.id);
        } else {
          await supabase.from("investors").update({ subscription_tier: "free" }).eq("owner_id", profile.id);
        }

        await sendSubscriptionCancelledEmail(
          profile.email,
          profile.full_name || "there",
          profile.subscription_tier || "paid",
        ).catch(() => {});
        break;
      }

      // ── Payment failed ───────────────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice      = event.data.object as Stripe.Invoice;
        const attemptCount = invoice.attempt_count as 1 | 2 | 3;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .eq("stripe_customer_id", invoice.customer as string)
          .single();

        if (!profile) break;

        await sendPaymentFailedEmail(
          profile.email,
          profile.full_name || "there",
          Math.min(attemptCount, 3) as 1 | 2 | 3,
        ).catch(() => {});

        if (attemptCount >= 3) {
          await supabase
            .from("startups")
            .update({ status: "suspended" })
            .eq("owner_id", profile.id);
        }
        break;
      }

      // ── Payment succeeded ────────────────────────────────────────────────────
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", invoice.customer as string)
          .single();

        if (!profile) break;

        await supabase
          .from("profiles")
          .update({ subscription_status: "active" })
          .eq("id", profile.id);

        await supabase
          .from("startups")
          .update({ status: "active" })
          .eq("owner_id", profile.id)
          .eq("status", "suspended");
        break;
      }

      // ── Checkout completed ───────────────────────────────────────────────────
      // customer.subscription.created fires separately and handles the tier
      // write; this handler only needs to capture the subscription ID if it
      // wasn't already captured by the subscription event.
      case "checkout.session.completed": {
        const session  = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};
        const { userId, role, tier } = metadata;

        if (!userId || !tier) break;

        await supabase
          .from("profiles")
          .update({
            subscription_tier:   tier,
            subscription_status: "active",
            ...(session.subscription
              ? { stripe_subscription_id: session.subscription as string }
              : {}),
          })
          .eq("id", userId);

        const isStartupTier = ["starter", "growth"].includes(tier);
        if (role === "founder" || isStartupTier) {
          await supabase
            .from("startups")
            .update({ subscription_tier: tier })
            .eq("owner_id", userId);
        } else {
          await supabase
            .from("investors")
            .update({ subscription_tier: tier })
            .eq("owner_id", userId);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("Error processing webhook:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
