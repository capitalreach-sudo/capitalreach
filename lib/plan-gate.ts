import { createAdminClient } from "@/lib/supabase-server";
import { getLaunchStatus } from "@/lib/launchMode";
import { buildAccessContext, founderCan, investorCan, type FounderCapabilities, type InvestorCapabilities } from "@/lib/access";

/**
 * One call from a route handler to "what may this account actually do".
 *
 * The capability model has existed since early on, but only a few surfaces
 * consulted it — which is how the three plans ended up being the same product
 * at three prices. A pricing table that claims a gate nobody enforces is a lie
 * with a checkmark next to it, so every feature the plans now differ on is
 * checked here, in the route that owns it.
 *
 * Note for anyone reading this during the free launch period: founderTier and
 * investorTier hand everybody the top tier while launch mode is on, so none of
 * these gates bind yet. They start mattering the day launch mode ends, which
 * is exactly when the plans need to mean something.
 */

export async function founderGate(userId: string): Promise<FounderCapabilities> {
  const admin = createAdminClient();
  const [{ data: profile }, { data: startup }, { isLaunch }] = await Promise.all([
    admin.from("profiles").select("id, role, subscription_tier, suspended, account_status").eq("id", userId).maybeSingle(),
    admin.from("startups").select("subscription_tier").eq("owner_id", userId).maybeSingle(),
    getLaunchStatus(),
  ]);
  const ctx = buildAccessContext(profile, isLaunch);
  // The listing's own tier governs, not the owner profile's — they can differ
  // after an admin grant, and the listing is what was paid for.
  return founderCan(startup?.subscription_tier ? { ...ctx, tier: startup.subscription_tier } : ctx);
}

export async function investorGate(userId: string): Promise<InvestorCapabilities> {
  const admin = createAdminClient();
  const [{ data: profile }, { data: investor }, { isLaunch }] = await Promise.all([
    admin.from("profiles").select("id, role, subscription_tier, suspended, account_status").eq("id", userId).maybeSingle(),
    admin.from("investors").select("subscription_tier").eq("owner_id", userId).maybeSingle(),
    getLaunchStatus(),
  ]);
  const ctx = buildAccessContext(profile, isLaunch);
  return investorCan(investor?.subscription_tier ? { ...ctx, tier: investor.subscription_tier } : ctx);
}

/** The 402-with-an-explanation every gated route returns. */
export function planRequired(feature: string, plan: string) {
  return { error: `${feature} is part of the ${plan} plan.`, upgrade: true, plan };
}
