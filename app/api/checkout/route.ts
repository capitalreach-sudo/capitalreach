import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createCheckoutSession, getOrCreateCustomer } from "@/lib/stripe";
import { getLaunchStatus } from "@/lib/launchMode";
import { FOUNDER_PLANS_LIST, INVESTOR_PLANS_LIST } from "@/lib/plans";
import type { FounderPlan, InvestorPlan } from "@/lib/plans";

type AnyPlan = FounderPlan | InvestorPlan;

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { planId, userType } = await req.json() as {
    planId:   string;
    userType: "founder" | "investor";
  };

  const plans: AnyPlan[] = userType === "founder" ? FOUNDER_PLANS_LIST : INVESTOR_PLANS_LIST;
  const plan = plans.find(p => p.id === planId);
  if (!plan) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });

  const dashboardPath = userType === "founder" ? "/dashboard/startup" : "/dashboard/investor";

  // Free plan — no Stripe needed
  if (plan.price === 0 || plan.envKey === null) {
    return NextResponse.json({ url: `${process.env.NEXT_PUBLIC_APP_URL}${dashboardPath}` });
  }

  // Launch mode — skip payment, grant access immediately
  const { isLaunch } = await getLaunchStatus();
  if (isLaunch) {
    return NextResponse.json({
      url: `${process.env.NEXT_PUBLIC_APP_URL}${dashboardPath}?upgraded=1&launch=1`,
    });
  }

  // Stripe price must be configured
  const priceId = process.env[plan.envKey];
  if (!priceId) {
    console.error(`Stripe price not configured: ${plan.envKey}`);
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
    metadata:   { userId: user.id, role: userType, tier: plan.id },
  });

  return NextResponse.json({ url: session.url });
}
