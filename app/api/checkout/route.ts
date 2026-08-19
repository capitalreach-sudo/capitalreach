import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { createCheckoutSession, getOrCreateCustomer } from "@/lib/stripe";
import { getLaunchStatus } from "@/lib/launchMode";
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

  // Launch mode — skip payment, grant access immediately. Persist the tier so
  // it survives launch ending: without this, a first-100 user who upgrades
  // here kept the tier only while access.ts forced it during launch, then
  // silently dropped to free. The onboarding routes already persist; this
  // brings the pricing/billing path in line.
  const { isLaunch } = await getLaunchStatus();
  if (isLaunch) {
    const admin = createAdminClient();
    const entityTable = userType === "founder" ? "startups" : "investors";
    await Promise.all([
      admin.from("profiles").update({ subscription_tier: plan.id, subscription_status: "active" }).eq("id", user.id),
      admin.from(entityTable).update({ subscription_tier: plan.id }).eq("owner_id", user.id),
    ]);
    return NextResponse.json({
      url: `${process.env.NEXT_PUBLIC_APP_URL}${dashboardPath}?upgraded=1&launch=1`,
    });
  }

  // Stripe price must be configured
  const envKey = priceEnvKey(plan, interval) ?? plan.envKey;
  const priceId = process.env[envKey];
  if (!priceId) {
    console.error(`Stripe price not configured: ${envKey}`);
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
    metadata:   { userId: user.id, role: userType, tier: plan.id, interval },
  });

  return NextResponse.json({ url: session.url });
}
