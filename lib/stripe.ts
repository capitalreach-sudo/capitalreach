import Stripe from "stripe";

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
  currency: string = "USD"
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

  const invoice = await stripe.invoices.create({
    customer: customerId,
    auto_advance: true,
    collection_method: "send_invoice",
    days_until_due: 14,
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

export const TIER_MAP: Record<string, string> = {
  // new env var names (v2 pricing)
  [process.env.STRIPE_PRICE_FOUNDER_STARTER_MONTHLY || ""]: "starter",
  [process.env.STRIPE_PRICE_FOUNDER_GROWTH_MONTHLY  || ""]: "growth",
  [process.env.STRIPE_PRICE_INVESTOR_ANGEL_MONTHLY  || ""]: "angel",
  [process.env.STRIPE_PRICE_INVESTOR_PRO_MONTHLY    || ""]: "pro",
  // legacy env var names (kept for backwards compat during transition)
  [process.env.STRIPE_STARTUP_STARTER_PRICE_ID || ""]: "starter",
  [process.env.STRIPE_STARTUP_GROWTH_PRICE_ID  || ""]: "growth",
  [process.env.STRIPE_INVESTOR_ANGEL_PRICE_ID  || ""]: "angel",
  [process.env.STRIPE_INVESTOR_PRO_PRICE_ID    || ""]: "pro",
};
