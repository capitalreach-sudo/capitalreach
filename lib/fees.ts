/**
 * E46: the success-fee ledger.
 *
 * A fee has one state at a time and every downstream decision — does it
 * appear in the ledger, may it be retried, should the founder be chased —
 * follows from it. Keeping that in one pure function means the admin table,
 * the cron and the tests cannot disagree about whether the platform is owed
 * money.
 */

import { getCurrency } from "@/lib/currency";

export type FeeState =
  | "none"        // no fee on this deal
  | "collected"   // paid, through Stripe or recorded offline
  | "reversed"    // refunded or charged back — the money came back out
  | "disputed"    // the founder says the amount is wrong; chasing stops
  | "outstanding" // invoiced, not paid
  | "unbillable"  // earned but never invoiced — no Stripe customer, or Stripe refused
  | "waived";     // written off on purpose

export interface FeeDeal {
  success_fee_amount: number | null;
  success_fee_invoiced: boolean | null;
  success_fee_paid_at: string | null;
  fee_billing_status: string | null;
  /** The deal's currency; decides the minor-unit factor (JPY is zero-decimal). */
  currency?: string | null;
  fee_waived_at?: string | null;
  closed_at?: string | null;
  fee_reminder_count?: number | null;
  fee_reminder_last_at?: string | null;
  fee_disputed_at?: string | null;
  fee_dispute_resolved_at?: string | null;
  fee_refunded_at?: string | null;
  fee_chargeback_at?: string | null;
  fee_chargeback_resolved_at?: string | null;
  /** Set when the fee is being paid in instalments (migration 087). */
  fee_plan_months?: number | null;
}

export function feeState(d: FeeDeal): FeeState {
  if (d.success_fee_amount == null || Number(d.success_fee_amount) <= 0) return "none";
  if (d.fee_waived_at || d.fee_billing_status === "waived") return "waived";
  // A reversal outranks payment: the invoice was paid and then the money went
  // back out. Counting it as revenue is counting money the platform no longer
  // has. A chargeback that the platform won is resolved and collected again.
  if (d.fee_refunded_at || d.fee_billing_status === "refunded") return "reversed";
  if (d.fee_chargeback_at && !d.fee_chargeback_resolved_at) return "reversed";
  if (d.fee_billing_status === "charged_back") return "reversed";
  if (d.success_fee_paid_at || d.fee_billing_status === "paid_offline") return "collected";
  // An open dispute outranks the billing status. Payment settles it, and a
  // write-off settles it — but while it is open the platform stops asserting
  // that this money is simply owed.
  if (d.fee_disputed_at && !d.fee_dispute_resolved_at) return "disputed";
  if (d.fee_billing_status === "no_customer" || d.fee_billing_status === "failed"
      || d.fee_billing_status === "uncollectible" || d.fee_billing_status === "voided") return "unbillable";
  if (d.success_fee_invoiced) return "outstanding";
  // Amount recorded, never invoiced, no failure noted: still unbillable — the
  // platform is owed money and no invoice exists. Silence is not "collected".
  return "unbillable";
}

/**
 * success_fee_amount is stored in MINOR units, and close/route.ts scales it by
 * the currency's minor-unit factor when it stores it. Dividing by a flat 100
 * here understated every zero-decimal currency 100× (a ¥5,000,000 fee shown and
 * ledgered as ¥50,000) even though the Stripe invoice itself was correct. The
 * factor must match the one used to store it.
 */
export function feeMajor(d: FeeDeal): number {
  // Currency is stored lowercase (Stripe convention); the currency table is
  // keyed uppercase, so normalise before the lookup or JPY silently falls
  // through to the two-decimal default.
  const factor = getCurrency(d.currency?.toUpperCase()).zeroDecimal ? 1 : 100;
  return (Number(d.success_fee_amount) || 0) / factor;
}

/**
 * Dunning schedule, in days after the invoice was raised: a reminder at one
 * week, another at two, a last one at a month. Three and then stop — past
 * that it is a conversation, not a notification.
 */
export const DUNNING_DAYS = [7, 14, 30] as const;
export const MAX_REMINDERS = DUNNING_DAYS.length;

export function daysBetween(from: string | Date, to: string | Date): number {
  const a = new Date(from).getTime(), b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

/**
 * Whether this fee is due a reminder now. `since` is when the clock starts
 * (the close date). Reminders never fire twice on the same day, so a cron
 * that runs more than once cannot double-chase.
 */
export function reminderDue(d: FeeDeal, now: Date = new Date()): boolean {
  if (feeState(d) !== "outstanding") return false;
  // A fee on an instalment plan is not late for being unpaid — it is being
  // paid on an agreed schedule. Chasing it with the flat 7/14/30 reminders
  // would be chasing somebody for money that is not due yet, which is how a
  // payment plan turns into a support ticket. The cron chases the overdue
  // INSTALMENT instead.
  if (d.fee_plan_months) return false;
  const since = d.closed_at;
  if (!since) return false;
  const sent = d.fee_reminder_count ?? 0;
  if (sent >= MAX_REMINDERS) return false;
  if (d.fee_reminder_last_at && daysBetween(d.fee_reminder_last_at, now) < 1) return false;
  return daysBetween(since, now) >= DUNNING_DAYS[sent];
}

/**
 * A fee that could not be billed becomes billable the moment the founder
 * has a Stripe customer. Nothing used to notice; this is what the cron
 * checks so the platform stops losing fees to a missing payment method.
 */
export function retryable(d: FeeDeal, hasStripeCustomer: boolean): boolean {
  return feeState(d) === "unbillable" && hasStripeCustomer;
}

/**
 * What the CRON may re-invoice without a human. Narrower than retryable() on
 * purpose: 'no_customer' and 'failed' mean no invoice was ever successfully
 * raised, so raising one is a rescue. 'uncollectible' means Stripe raised one
 * and gave up collecting — re-invoicing that on a schedule would just mint
 * duplicate invoices at the founder. An operator can still retry it by hand.
 */
export function autoRetryable(d: FeeDeal, hasStripeCustomer: boolean): boolean {
  if (!retryable(d, hasStripeCustomer)) return false;
  return d.fee_billing_status === "no_customer" || d.fee_billing_status === "failed" || d.fee_billing_status == null;
}

export interface LedgerTotals { outstanding: number; unbillable: number; waived: number; collected: number; disputed: number; reversed: number }

export function ledgerTotals(deals: FeeDeal[]): LedgerTotals {
  const totals: LedgerTotals = { outstanding: 0, unbillable: 0, waived: 0, collected: 0, disputed: 0, reversed: 0 };
  for (const d of deals) {
    const s = feeState(d);
    if (s === "none") continue;
    totals[s] += feeMajor(d);
  }
  return totals;
}
