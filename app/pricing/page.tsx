import { FOUNDER_PLANS_LIST, INVESTOR_PLANS_LIST } from "@/lib/plans";
import {
  getStageStatus,
  founderStagePrice,
  investorStagePrice,
  nextStagePrice,
} from "@/lib/pricing-stage";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PricingClient, type PricingViewer, type StagePrice, type StagePricing } from "./pricing-client";

/**
 * The stage decides every price on this page, so it is resolved here and
 * rendered into the first paint. Fetching it from the client would paint
 * standard prices during the founding stage and correct them a moment later,
 * and a price that flickers is a price nobody believes.
 *
 * Dynamic because the stage is live platform state: a build-time snapshot
 * would keep quoting the old rung of the ladder after an admin advances it.
 */
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const status = await getStageStatus();

  const founder: Record<string, StagePrice> = {};
  for (const plan of FOUNDER_PLANS_LIST) {
    const money = founderStagePrice(plan.id, status.stage);
    founder[plan.id] = {
      price: money.price,
      annualPrice: money.annualPrice,
      nextPrice: nextStagePrice("founder", plan.id, status.stage)?.price ?? null,
    };
  }

  const investor: Record<string, StagePrice> = {};
  for (const plan of INVESTOR_PLANS_LIST) {
    const money = investorStagePrice(plan.id, status.stage);
    investor[plan.id] = {
      price: money.price,
      annualPrice: money.annualPrice,
      nextPrice: nextStagePrice("investor", plan.id, status.stage)?.price ?? null,
    };
  }

  const pricing: StagePricing = {
    stage: status.stage,
    memberCount: status.memberCount,
    target: status.target,
    isFounding: status.isFounding,
    founder,
    investor,
  };

  // The viewer decides the default tab, the marked plan and every call to
  // action, so it is resolved with the prices for the same reason: a member
  // must never be shown a sign-up CTA while the client catches up.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  let viewer: PricingViewer | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles").select("role, subscription_tier, stripe_customer_id").eq("id", user.id).maybeSingle();
    viewer = { role: profile?.role ?? null, tier: profile?.subscription_tier ?? null, hasBillingAccount: !!profile?.stripe_customer_id };
  }

  return <PricingClient pricing={pricing} viewer={viewer} />;
}
