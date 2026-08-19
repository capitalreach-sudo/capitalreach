import { NextRequest, NextResponse } from "next/server";
import { logSystemEvent } from "@/lib/system-events";
import { constructWebhookEvent, TIER_MAP } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase-server";
import { incrementMemberCount } from "@/lib/launchMode";
import { sendPaymentFailedEmail, sendSubscriptionCancelledEmail } from "@/lib/resend";
import { notifyUser, notifyUsers } from "@/lib/notify-user";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

/**
 * Dispute events carry a charge, not an invoice. One extra Stripe call gets
 * from the charge to the invoice the fee was raised on.
 */
async function dealForCharge(
  supabase: ReturnType<typeof createAdminClient>,
  chargeId: string | undefined,
): Promise<{ id: string } | null> {
  if (!chargeId) return null;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    const invoiceId = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
    if (!invoiceId) return null;
    const { data } = await supabase.from("deals").select("id").eq("stripe_invoice_id", invoiceId).maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.arrayBuffer();
  const sig  = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(Buffer.from(body), sig);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    await logSystemEvent("webhook/stripe", "error", "Signature verification failed", { error: String(err) });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotency: Stripe retries on any non-2xx, and this handler used to
  // return 500 on error — so a partially-applied handler was guaranteed to
  // replay. Record the event id first; a duplicate short-circuits to 200.
  {
    const { error: dupErr } = await supabase
      .from("stripe_events")
      .insert({ id: event.id, type: event.type });
    if (dupErr) {
      // 23505 = unique violation → already processed.
      if ((dupErr as { code?: string }).code === "23505") {
        return NextResponse.json({ received: true, duplicate: true });
      }
      // Any other insert failure: proceed (never let bookkeeping block money
      // events) but note it.
      await logSystemEvent("webhook/stripe", "error", "stripe_events insert failed", { error: dupErr.message }).catch(() => {});
    }
  }

  // invoice.* fires for every invoice on the account, and this app raises two
  // very different kinds: recurring subscription invoices, and one-off 2%
  // success-fee invoices from /api/deals/close. Treating them alike meant
  // paying a success fee flipped subscription_status to "active" and
  // un-suspended a listing that was suspended for an unpaid subscription.
  const isSuccessFeeInvoice = (inv: Stripe.Invoice) =>
    inv.metadata?.type === "success_fee" || !inv.subscription;

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
          .select("id, role, tier_override")
          .eq("stripe_customer_id", sub.customer as string)
          .single();

        if (!profile) break;

        // An admin comp (tier_override) owns the tier; Stripe still owns the
        // subscription metadata. Previously this update silently un-comped
        // people on the next billing event.
        if (profile.tier_override) {
          await supabase
            .from("profiles")
            .update({ subscription_status: sub.status, stripe_subscription_id: sub.id })
            .eq("id", profile.id);
          break;
        }

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

        // An unpaid success fee is a collections matter, not a lapsed
        // subscription. It must not send the subscription-dunning email and
        // must not suspend the founder's listing.
        if (isSuccessFeeInvoice(invoice)) {
          // E48: "needs manual follow-up" used to mean a console line nobody
          // reads. The fee ledger exists now, so the failure lands there.
          await supabase
            .from("deals")
            .update({ fee_billing_error: `Stripe collection failed (attempt ${attemptCount})` })
            .eq("stripe_invoice_id", invoice.id);
          await logSystemEvent("webhook/stripe", "error", "Success-fee invoice unpaid", { invoice: invoice.id, attemptCount }).catch(() => {});
          break;
        }

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

        // Record the success fee against its deal and stop. Crediting it as a
        // subscription payment is what let a founder pay a success fee to
        // restore a listing suspended for an unpaid subscription.
        if (isSuccessFeeInvoice(invoice)) {
          await supabase
            .from("deals")
            .update({ success_fee_paid_at: new Date().toISOString() })
            .eq("stripe_invoice_id", invoice.id);
          break;
        }

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

      // ── SCA: the customer has to authenticate before the money moves ────────
      // Stripe raises this and then waits. Nothing told the customer, so a
      // payment could sit unauthenticated until the invoice expired and the
      // account looked like a deadbeat.
      case "invoice.payment_action_required": {
        const invoice = event.data.object as Stripe.Invoice;
        const { data: profile } = await supabase
          .from("profiles").select("id").eq("stripe_customer_id", invoice.customer as string).maybeSingle();
        if (!profile) break;
        await notifyUser({
          userId: profile.id,
          type: "fee_due",
          title: "Your bank needs to authorise this payment",
          body: "The payment is on hold until you confirm it with your bank.",
          href: invoice.hosted_invoice_url || "/dashboard/startup/billing",
        }).catch(() => {});
        await logSystemEvent("webhook/stripe", "info", "Payment action required", { invoice: invoice.id }).catch(() => {});
        break;
      }

      // ── Stripe gave up collecting, or the invoice was voided ────────────────
      case "invoice.marked_uncollectible":
      case "invoice.voided": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!isSuccessFeeInvoice(invoice)) break;
        await supabase
          .from("deals")
          .update({ fee_billing_status: event.type === "invoice.voided" ? "voided" : "uncollectible" })
          .eq("stripe_invoice_id", invoice.id);
        break;
      }

      // ── Money going back out ────────────────────────────────────────────────
      // A refunded or charged-back success fee stayed marked collected
      // forever, so the ledger and the revenue page kept counting money the
      // platform no longer had.
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const invoiceId = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
        if (!invoiceId) break;
        const { data: deal } = await supabase
          .from("deals").select("id, startup_id, investor_id").eq("stripe_invoice_id", invoiceId).maybeSingle();
        if (!deal) break;
        await supabase.from("deals").update({
          fee_refunded_at: new Date().toISOString(),
          fee_refund_amount: charge.amount_refunded ?? null,
          fee_billing_status: "refunded",
        }).eq("id", deal.id);
        await logSystemEvent("webhook/stripe", "error", "Success fee refunded", { deal: deal.id, amount: charge.amount_refunded }).catch(() => {});
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        const deal = await dealForCharge(supabase, chargeId);
        if (!deal) break;
        await supabase.from("deals").update({
          fee_chargeback_at: new Date().toISOString(),
          fee_chargeback_resolved_at: null,
          fee_billing_status: "charged_back",
        }).eq("id", deal.id);
        // A chargeback has a deadline. It is the one payment event that has to
        // reach a person the same day.
        const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin").limit(20);
        const adminIds = (admins ?? []).map(a => a.id);
        if (adminIds.length) {
          await notifyUsers(adminIds, {
            type: "fee_due",
            title: "Chargeback on a success fee",
            body: "The bank has pulled the money back. Evidence is due to Stripe.",
            href: "/admin",
          }).catch(() => {});
        }
        await logSystemEvent("webhook/stripe", "error", "Success fee charged back", { deal: deal.id, dispute: dispute.id }).catch(() => {});
        break;
      }

      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        const deal = await dealForCharge(supabase, chargeId);
        if (!deal) break;
        // won → the money is the platform's again; lost/warning_closed → it is
        // not, and the row stays reversed.
        const won = dispute.status === "won";
        await supabase.from("deals").update({
          fee_chargeback_resolved_at: won ? new Date().toISOString() : null,
          fee_billing_status: won ? "invoiced" : "charged_back",
        }).eq("id", deal.id);
        await logSystemEvent("webhook/stripe", won ? "info" : "error", `Chargeback ${dispute.status}`, { deal: deal.id }).catch(() => {});
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
    await logSystemEvent("webhook/stripe", "error", "Handler failed", { error: String(err) });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
