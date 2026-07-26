import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";
import { isStripeConfigured, env } from "@/lib/env";

// Prices live here, not in the request body.
//
// This route previously took `amount` from the client and passed it straight
// into Stripe's unit_amount, so the buyer decided what to pay: a 29 USD report
// could be bought for 1 USD, which was the only lower bound the check enforced.
// The client now names a product; the server decides the price.
const PRODUCTS = {
  due_diligence: {
    amountCents: 2900,
    name: "AI Due Diligence Report",
    description: "One-time AI investment memo for a startup on CapitalReach",
  },
} as const;

type ProductType = keyof typeof PRODUCTS;

function isProductType(v: unknown): v is ProductType {
  return typeof v === "string" && v in PRODUCTS;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isStripeConfigured) {
    return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("suspended, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.suspended || profile?.account_status === "suspended" || profile?.account_status === "banned") {
    return NextResponse.json({ error: "Your account is suspended" }, { status: 403 });
  }

  const { startupId, type } = await req.json();

  if (!isProductType(type)) {
    return NextResponse.json({ error: "Unknown product" }, { status: 400 });
  }
  const product = PRODUCTS[type];

  // A one-time report is always bought against a specific startup; verify it
  // exists and is listed rather than taking the id on trust.
  if (typeof startupId !== "string" || !startupId) {
    return NextResponse.json({ error: "startupId required" }, { status: 400 });
  }
  const { data: startup } = await supabase
    .from("startups")
    .select("id, status")
    .eq("id", startupId)
    .maybeSingle();
  if (!startup || startup.status !== "active") {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: product.amountCents,
            product_data: { name: product.name, description: product.description },
          },
          quantity: 1,
        },
      ],
      success_url: `${env.appUrl}/ai?diligence_success=1&startupId=${startupId}`,
      cancel_url: `${env.appUrl}/ai`,
      customer_email: user.email ?? undefined,
      metadata: { userId: user.id, startupId, type },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout/one-time]", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
