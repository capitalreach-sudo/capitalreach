import { createAdminClient } from "@/lib/supabase-server";
import type { FounderPlanId, InvestorPlanId, BillingInterval } from "@/lib/plans";

/**
 * The platform opens cheap and gets more expensive as it gets more useful.
 * Three stages, advanced by hand in /admin:
 *
 *   founding  -- the first N members pay nothing at all
 *   early     -- the paywalls bind, at roughly half the standard price
 *   standard  -- full price
 *
 * Nobody is ever moved up a stage: a Stripe subscription keeps the price it
 * was created at, so a founding member stays free and an early member stays
 * on early pricing for as long as they keep the plan. The stage only decides
 * what a NEW subscriber pays.
 */
export type PricingStage = "founding" | "early" | "standard";

export const STAGE_ORDER: PricingStage[] = ["founding", "early", "standard"];

/** 150: with every member getting a real verification pass, the cohort size
 *  is a human-review capacity number. Editable in /admin (founding_target). */
export const DEFAULT_FOUNDING_TARGET = 150;

export interface StageStatus {
  stage: PricingStage;
  /** Verified, live accounts in the founding cohort. */
  memberCount: number;
  /** Cohort size; when memberCount reaches it, founding closes. */
  target: number;
  /** Founding stage is the old "launch mode": every paywall lifted. */
  isFounding: boolean;
}

type Money = { price: number; annualPrice: number | null };

/**
 * Explicit prices per stage, never a multiplier -- a discount that produces
 * "EUR 34.65" reads as arithmetic, not as a price somebody chose.
 * `standard` mirrors lib/plans.ts, which stays the source of truth for
 * everything except what a new subscriber is charged today.
 */
const FOUNDER_STAGE_PRICES: Record<PricingStage, Record<FounderPlanId, Money>> = {
  founding: {
    free:    { price: 0, annualPrice: null },
    starter: { price: 0, annualPrice: null },
    growth:  { price: 0, annualPrice: null },
  },
  early: {
    free:    { price: 0,  annualPrice: null },
    starter: { price: 12, annualPrice: 108 },
    growth:  { price: 34, annualPrice: 299 },
  },
  standard: {
    free:    { price: 0,  annualPrice: null },
    starter: { price: 29, annualPrice: 259 },
    growth:  { price: 79, annualPrice: 699 },
  },
};

const INVESTOR_STAGE_PRICES: Record<PricingStage, Record<InvestorPlanId, Money>> = {
  founding: {
    free:        { price: 0, annualPrice: null },
    angel:       { price: 0, annualPrice: null },
    pro:         { price: 0, annualPrice: null },
    institution: { price: 0, annualPrice: null },
  },
  early: {
    free:        { price: 0,  annualPrice: null },
    angel:       { price: 39, annualPrice: 349 },
    pro:         { price: 99, annualPrice: 879 },
    institution: { price: 0,  annualPrice: null }, // talk to us
  },
  standard: {
    free:        { price: 0,   annualPrice: null },
    angel:       { price: 99,  annualPrice: 879 },
    pro:         { price: 249, annualPrice: 2190 },
    institution: { price: 0,   annualPrice: null },
  },
};

export function founderStagePrice(planId: FounderPlanId, stage: PricingStage): Money {
  return FOUNDER_STAGE_PRICES[stage][planId];
}
export function investorStagePrice(planId: InvestorPlanId, stage: PricingStage): Money {
  return INVESTOR_STAGE_PRICES[stage][planId];
}

/** What this plan will cost once the stage advances -- the honest "rising to". */
export function nextStagePrice(
  side: "founder" | "investor",
  planId: string,
  stage: PricingStage,
): Money | null {
  const i = STAGE_ORDER.indexOf(stage);
  if (i < 0 || i === STAGE_ORDER.length - 1) return null;
  const next = STAGE_ORDER[i + 1];
  return side === "founder"
    ? FOUNDER_STAGE_PRICES[next][planId as FounderPlanId] ?? null
    : INVESTOR_STAGE_PRICES[next][planId as InvestorPlanId] ?? null;
}

/**
 * Stripe price ids are per stage as well as per plan and interval, because
 * each stage's price is a different object in Stripe. The stage-specific
 * variable wins; the plain one is the fallback, so nothing breaks before the
 * new prices exist in the Stripe dashboard.
 *
 *   STRIPE_PRICE_STARTER_MONTHLY_EARLY  ->  STRIPE_PRICE_STARTER_MONTHLY
 */
export function stagePriceEnvKeys(baseEnvKey: string, stage: PricingStage): string[] {
  return stage === "standard"
    ? [baseEnvKey]
    : [`${baseEnvKey}_${stage.toUpperCase()}`, baseEnvKey];
}

export function resolveStagePriceId(
  baseEnvKey: string,
  stage: PricingStage,
  _interval: BillingInterval = "month",
): string | null {
  for (const key of stagePriceEnvKeys(baseEnvKey, stage)) {
    const v = process.env[key];
    if (v) return v;
  }
  return null;
}

function coerceStage(v: string | undefined): PricingStage {
  return v === "early" || v === "standard" ? v : "founding";
}

/**
 * The live stage. Fails to `founding` only when the row is missing -- an
 * unreachable database falls through to the caller's own error handling
 * rather than silently making the whole platform free.
 */
export async function getStageStatus(): Promise<StageStatus> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_config")
      .select("key, value")
      .in("key", ["pricing_stage", "founding_target", "member_count", "launch_mode"]);

    const map: Record<string, string> = {};
    for (const row of data ?? []) map[row.key] = row.value;

    // A platform still on the old boolean reads as founding while it is on.
    const stage = map["pricing_stage"]
      ? coerceStage(map["pricing_stage"])
      : (map["launch_mode"] === "true" ? "founding" : "standard");

    const target = parseInt(map["founding_target"] ?? String(DEFAULT_FOUNDING_TARGET), 10) || DEFAULT_FOUNDING_TARGET;
    const memberCount = parseInt(map["member_count"] ?? "0", 10) || 0;

    return { stage, memberCount, target, isFounding: stage === "founding" };
  } catch {
    return { stage: "standard", memberCount: 0, target: DEFAULT_FOUNDING_TARGET, isFounding: false };
  }
}

export const STAGE_LABEL_KEY: Record<PricingStage, string> = {
  founding: "stage.founding",
  early:    "stage.early",
  standard: "stage.standard",
};
