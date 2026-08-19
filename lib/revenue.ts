import { getFounderPlan, getInvestorPlan } from "@/lib/plans";
import { feeState, feeMajor, type FeeDeal } from "@/lib/fees";

/**
 * E45: the operator's revenue, computed rather than estimated.
 *
 * The admin page summed plan prices across the FIRST FIFTY rows it happened
 * to have loaded for the table below — so "MRR" silently under-reported the
 * moment the platform passed fifty accounts, which it now has. And the 2%
 * success fee, the actual business model, appeared nowhere at all.
 *
 * Subscription MRR is counted over every account; fee revenue comes from the
 * deals themselves: billed (an invoice was raised), collected (it was paid),
 * outstanding (raised, unpaid), and unbillable (a fee was due but the founder
 * had no payment method — money the platform earned and cannot collect).
 */
export interface RevenueSummary {
  subscriptionMrr: number;
  payingAccounts: number;
  byTier: Array<{ tier: string; count: number; mrr: number }>;
  feesBilled: number;
  feesCollected: number;
  feesOutstanding: number;
  feesUnbillable: number;
  /** Refunded or charged back — money that came back out after being paid. */
  feesReversed: number;
  feeCurrencies: string[];
}

/** Monthly price for a stored tier value, whichever side it belongs to. */
export function tierPrice(tier: string | null | undefined): number {
  if (!tier) return 0;
  // A tier value belongs to one side or the other; whichever resolves to a
  // paid plan is the price. Free/unknown resolves to 0 on both.
  const f = getFounderPlan(tier);
  if (f.price > 0 && (tier === "starter" || tier === "growth")) return f.price;
  const i = getInvestorPlan(tier);
  return i.price > 0 ? i.price : 0;
}

export function summariseRevenue(
  tiers: Array<{ subscription_tier: string | null }>,
  deals: Array<FeeDeal & { currency: string | null }>,
): RevenueSummary {
  const counts = new Map<string, { count: number; mrr: number }>();
  let subscriptionMrr = 0, payingAccounts = 0;
  for (const t of tiers) {
    const price = tierPrice(t.subscription_tier);
    if (price <= 0) continue;
    const key = t.subscription_tier ?? "unknown";
    const prev = counts.get(key) ?? { count: 0, mrr: 0 };
    counts.set(key, { count: prev.count + 1, mrr: prev.mrr + price });
    subscriptionMrr += price;
    payingAccounts += 1;
  }

  // The buckets come from feeState() rather than a second reading of the same
  // columns. This function had its own copy of the rules and would have gone
  // on counting a refunded fee as collected — exactly the drift that having
  // one state machine is meant to prevent.
  let feesBilled = 0, feesCollected = 0, feesOutstanding = 0, feesUnbillable = 0, feesReversed = 0;
  const currencies = new Set<string>();
  for (const d of deals) {
    const amount = feeMajor(d);
    if (amount <= 0) continue;
    if (d.currency) currencies.add(d.currency);
    switch (feeState(d)) {
      case "collected":   feesBilled += amount; feesCollected += amount; break;
      case "outstanding": feesBilled += amount; feesOutstanding += amount; break;
      case "disputed":    feesBilled += amount; feesOutstanding += amount; break;
      case "reversed":    feesBilled += amount; feesReversed += amount; break;
      case "unbillable":  feesUnbillable += amount; break;
      default: break;   // waived and none are not revenue and not a shortfall
    }
  }

  return {
    subscriptionMrr, payingAccounts,
    byTier: Array.from(counts.entries()).map(([tier, v]) => ({ tier, ...v })).sort((a, b) => b.mrr - a.mrr),
    feesBilled, feesCollected, feesOutstanding, feesUnbillable, feesReversed,
    feeCurrencies: Array.from(currencies),
  };
}
