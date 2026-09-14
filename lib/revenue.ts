import { getFounderPlan, getInvestorPlan } from "@/lib/plans";
import { feeState, feeMajor, type FeeDeal } from "@/lib/fees";
import { DEFAULT_CURRENCY } from "@/lib/currency";

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
/** One currency's slice of the fee ledger. Deals never blend currencies,
 *  see feesByCurrency below for why. */
export interface CurrencyRevenue {
  currency: string;
  billed: number;
  collected: number;
  outstanding: number;
  /** Refunded or charged back, money that came back out after being paid. */
  reversed: number;
  unbillable: number;
}

export interface RevenueSummary {
  subscriptionMrr: number;
  payingAccounts: number;
  byTier: Array<{ tier: string; count: number; mrr: number }>;
  /**
   * Fee totals grouped by currency, never summed across currencies, a EUR
   * amount and a USD amount are different units, and adding the digits
   * together produces a number with no meaning, not "roughly the total".
   * Same shape the round calculator and deal pipeline stats already use
   * (app/pricing/pricing-client.tsx, components/shared/deal-kanban.tsx
   * `stats.byCurrency`). Sorted by billed volume, largest first, so the
   * platform's primary currency leads.
   */
  feesByCurrency: CurrencyRevenue[];
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
  //
  // Grouped by currency from the start: summing feeMajor(d) into one running
  // total regardless of d.currency would blend a EUR fee and a USD fee into a
  // single number that is neither, meaningless the moment a non-USD deal
  // closes. Grouping needs no FX rate to get wrong; it just keeps units apart.
  const byCurrency = new Map<string, CurrencyRevenue>();
  const bump = (cur: string, key: keyof Omit<CurrencyRevenue, "currency">, amount: number) => {
    const row = byCurrency.get(cur) ?? { currency: cur, billed: 0, collected: 0, outstanding: 0, reversed: 0, unbillable: 0 };
    row[key] += amount;
    byCurrency.set(cur, row);
  };
  for (const d of deals) {
    const amount = feeMajor(d);
    if (amount <= 0) continue;
    const cur = d.currency || DEFAULT_CURRENCY;
    switch (feeState(d)) {
      case "collected":   bump(cur, "billed", amount); bump(cur, "collected", amount); break;
      case "outstanding": bump(cur, "billed", amount); bump(cur, "outstanding", amount); break;
      case "disputed":    bump(cur, "billed", amount); bump(cur, "outstanding", amount); break;
      case "reversed":    bump(cur, "billed", amount); bump(cur, "reversed", amount); break;
      case "unbillable":  bump(cur, "unbillable", amount); break;
      default: break;   // waived and none are not revenue and not a shortfall
    }
  }
  const feesByCurrency = Array.from(byCurrency.values()).sort((a, b) => b.billed - a.billed);

  return {
    subscriptionMrr, payingAccounts,
    byTier: Array.from(counts.entries()).map(([tier, v]) => ({ tier, ...v })).sort((a, b) => b.mrr - a.mrr),
    feesByCurrency,
    feeCurrencies: feesByCurrency.map(c => c.currency),
  };
}
