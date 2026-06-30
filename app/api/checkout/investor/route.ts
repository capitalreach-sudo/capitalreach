import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { createCheckoutSession, getOrCreateCustomer } from "@/lib/stripe";

const TIER_PRICES: Record<string, string> = {
  angel:        process.env.STRIPE_INVESTOR_ANGEL_PRICE_ID!,
  pro_investor: process.env.STRIPE_INVESTOR_PRO_PRICE_ID!,
  institutional: process.env.STRIPE_INVESTOR_INSTITUTIONAL_PRICE_ID ?? process.env.STRIPE_PRICE_INVESTOR_PRO_MONTHLY ?? "",
};

/** Platform is free until this many users have joined */
const FREE_UNTIL_USER_COUNT = 100;

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", req.url));

  const tier = req.nextUrl.searchParams.get("tier");
  if (!tier || !TIER_PRICES[tier]) {
    return NextResponse.redirect(new URL("/pricing", req.url));
  }

  // ── Free-until-100 gate ───────────────────────────────────────────────
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("profiles")
      .select("*", { count: "exact", head: true });

    if ((count ?? 0) < FREE_UNTIL_USER_COUNT) {
      // Grant the requested tier for free — skip Stripe entirely
      await admin
        .from("profiles")
        .update({ subscription_tier: tier, subscription_status: "active" })
        .eq("id", user.id);

      await admin
        .from("investors")
        .update({ subscription_tier: tier })
        .eq("owner_id", user.id);

      const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/investor?upgraded=1&free=1`;
      return NextResponse.redirect(new URL(successUrl));
    }
  } catch (err) {
    // If the count check fails, fall through to Stripe checkout
    console.error("Free-gate check failed:", err);
  }
  // ─────────────────────────────────────────────────────────────────────

  const priceId = TIER_PRICES[tier];

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.email) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const customerId = await getOrCreateCustomer(user.id, profile.email, profile.full_name || undefined);

  const session = await createCheckoutSession({
    customerId,
    priceId,
    successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/investor?upgraded=1`,
    cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    metadata: { userId: user.id, role: "investor", tier: tier },
  });

  return NextResponse.redirect(session.url!);
}
