import Stripe from "stripe";
import { FOUNDER_PLANS_LIST, INVESTOR_PLANS_LIST } from "@/lib/plans";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
  typescript: true,
});

export async function getOrCreateCustomer(
  userId: string,
  email: string,
  name?: string
): Promise<string> {
  const { createAdminClient } = await import("@/lib/supabase-server");
  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await stripe.customers.create({ email, name });

  await supabase
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}

export async function createCheckoutSession({
  customerId,
  priceId,
  successUrl,
  cancelUrl,
  metadata,
}: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}) {
  return stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });
}

export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string
) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

// Stripe expects amounts in the currency's minor unit (cents) — except for
// zero-decimal currencies like JPY, where the amount is the whole unit.
const ZERO_DECIMAL_CURRENCIES = new Set(["jpy"]);

export async function createSuccessFeeInvoice(
  customerId: string,
  amountRaised: number,
  startupName: string,
  currency: string = "USD",
  dealId?: string
): Promise<Stripe.Invoice> {
  const cur = currency.toLowerCase();
  const minorUnitFactor = ZERO_DECIMAL_CURRENCIES.has(cur) ? 1 : 100;
  const feeAmount = Math.round(amountRaised * 0.02 * minorUnitFactor); // 2% success fee

  await stripe.invoiceItems.create({
    customer: customerId,
    amount: feeAmount,
    currency: cur,
    description: `CapitalReach Success Fee (2%) — ${startupName} funding round of ${currency.toUpperCase()} ${amountRaised.toLocaleString()}`,
  });

  // The metadata is load-bearing, not decoration. invoice.paid and
  // invoice.payment_failed fire for every invoice on the account, and the
  // webhook used to treat all of them as subscription events -- so paying a
  // success fee reactivated a listing that had been suspended for an unpaid
  // subscription. The webhook keys off this marker to tell the two apart.
  const invoice = await stripe.invoices.create({
    customer: customerId,
    auto_advance: true,
    collection_method: "send_invoice",
    days_until_due: 14,
    metadata: { type: "success_fee", ...(dealId ? { dealId } : {}) },
  });

  return stripe.invoices.finalizeInvoice(invoice.id);
}

export async function createOneTimeCharge(
  customerId: string,
  amountCents: number,
  description: string
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    customer: customerId,
    amount: amountCents,
    currency: "usd",
    description,
    confirm: false,
    payment_method_types: ["card"],
  });
}

export function constructWebhookEvent(payload: Buffer, sig: string) {
  return stripe.webhooks.constructEvent(
    payload,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}

/**
 * Stripe price ID -> tier slug, for the subscription webhook.
 *
 * Built from the plan definitions so there is exactly one place that knows
 * which env var holds which price. This previously listed two parallel naming
 * schemes for the same four prices -- the _MONTHLY names read by the pricing
 * checkout and the _PRICE_ID names read by the onboarding checkout -- which
 * meant configuring one scheme left the other checkout broken.
 *
 * Unset prices are filtered out. The old version spread `env || ""` into the
 * object literal, so every unconfigured price collapsed onto the same ""
 * key and the last one won -- with nothing configured, TIER_MAP[""] was "pro".
 * The webhook guards on `priceId ?` before looking up, so that never granted
 * anyone a tier; it was a trap waiting for a second caller, not a live bug.
 */
export const TIER_MAP: Record<string, string> = Object.fromEntries(
  [...FOUNDER_PLANS_LIST, ...INVESTOR_PLANS_LIST]
    .filter((plan) => plan.envKey !== null)
    .map((plan) => [process.env[plan.envKey!], plan.id as string] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[0]))
);
