import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createCheckoutSession, getOrCreateCustomer } from "@/lib/stripe";
import { getStageStatus, resolveStagePriceId } from "@/lib/pricing-stage";
import { FOUNDER_PLANS_LIST, INVESTOR_PLANS_LIST, priceEnvKey, type BillingInterval } from "@/lib/plans";
import type { FounderPlan, InvestorPlan } from "@/lib/plans";

type AnyPlan = FounderPlan | InvestorPlan;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { planId, userType, interval: rawInterval } = await req.json().catch(() => ({}));
  // Annual is a real charge against a different Stripe price, not a display
  // toggle. The pricing page has advertised "2 months free" for a while while
  // sending every checkout to the monthly price id — the discount was
  // decoration.
  const interval: BillingInterval = rawInterval === "year" ? "year" : "month";
  if (userType !== "founder" && userType !== "investor") {
    return NextResponse.json({ error: "Invalid userType" }, { status: 400 });
  }
  if (typeof planId !== "string") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const plans: AnyPlan[] = userType === "founder" ? FOUNDER_PLANS_LIST : INVESTOR_PLANS_LIST;
  const plan = plans.find(p => p.id === planId);
  if (!plan) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });

  const dashboardPath = userType === "founder" ? "/dashboard/startup" : "/dashboard/investor";

  // Free plan — no Stripe needed
  if (plan.price === 0 || plan.envKey === null) {
    return NextResponse.json({ url: `${process.env.NEXT_PUBLIC_APP_URL}${dashboardPath}` });
  }

  // The stage decides what a NEW subscriber pays, so it decides whether there
  // is anything to sell at all.
  const { stage } = await getStageStatus();

  // Founding stage: every paywall is already lifted for everyone (access.ts
  // reads the same flag), so there is nothing to buy. No session is created --
  // opening one would take money for access the member already has.
  if (stage === "founding") {
    return NextResponse.json(
      {
        error: "Everything is free during the founding stage. You already have full access -- there is nothing to pay for yet.",
        stage,
      },
      { status: 409 },
    );
  }

  // Stripe price must be configured. The stage-specific variable wins
  // (STRIPE_PRICE_..._EARLY) and the plain one is the fallback, so a stage can
  // advance before its prices exist in the Stripe dashboard without the
  // checkout going dark.
  const envKey = priceEnvKey(plan, interval) ?? plan.envKey;
  const priceId = resolveStagePriceId(envKey, stage, interval);
  if (!priceId) {
    console.error(`Stripe price not configured: ${envKey} (stage: ${stage})`);
    return NextResponse.json(
      { error: "This plan is not available right now. Please contact support." },
      { status: 503 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.email) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const customerId = await getOrCreateCustomer(
    user.id,
    profile.email,
    profile.full_name ?? undefined,
  );

  const session = await createCheckoutSession({
    customerId,
    priceId,
    successUrl: `${process.env.NEXT_PUBLIC_APP_URL}${dashboardPath}?upgraded=1`,
    cancelUrl:  `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    // The stage rides along: a subscription keeps the price it was created at
    // forever, so the rung it was sold on has to be recoverable later.
    metadata:   { userId: user.id, role: userType, tier: plan.id, interval, stage },
  });

  return NextResponse.json({ url: session.url });
}
