import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase-server";
import { createCheckoutSession, getOrCreateCustomer } from "@/lib/stripe";
import { getInvestorPlan } from "@/lib/plans";

// Prices come from the plan definitions rather than a second set of env vars.
// This route used to read STRIPE_INVESTOR_*_PRICE_ID while /api/checkout read
// the STRIPE_PRICE_INVESTOR_*_MONTHLY names for the same plans, so whichever
// scheme was left unset produced a broken checkout on one path only.
//
// The institution entry is deliberately gone. It used to fall back to the Pro
// price when the institution price was unset, which billed institutional
// customers -- the most expensive tier, and the one sold via "contact sales"
// -- at the Pro rate. Institution has no envKey precisely because it is not
// self-serve, so it now falls through to the redirect below.

/** Platform is free until this many users have joined */
const FREE_UNTIL_USER_COUNT = 100;

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/login", req.url));

  const tier = req.nextUrl.searchParams.get("tier");
  // getInvestorPlan normalises both slug spellings this app uses
  // ("pro"/"pro_investor", "institution"/"institutional") and falls back to
  // the free plan for anything unrecognised. A null envKey therefore covers
  // free, institution and garbage input in one check.
  const plan = getInvestorPlan(tier);
  if (!tier || plan.envKey === null) {
    return NextResponse.redirect(new URL("/pricing", req.url));
  }

  // This route writes an *investor* tier; refuse a non-investor caller so a
  // founder can't stamp an investor tier onto their own profile.
  {
    const { data: roleRow } = await createAdminClient()
      .from("profiles").select("role").eq("id", user.id).single();
    if (roleRow?.role !== "investor") {
      return NextResponse.redirect(new URL("/pricing", req.url));
    }
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

  const priceId = process.env[plan.envKey];
  if (!priceId) {
    // Previously this passed undefined straight to Stripe, which failed with
    // an opaque API error. Say what is actually wrong instead.
    console.error(`Stripe price not configured: ${plan.envKey}`);
    return NextResponse.redirect(new URL("/pricing?error=price_unavailable", req.url));
  }

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
