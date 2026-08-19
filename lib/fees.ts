/**
 * E46: the success-fee ledger.
 *
 * A fee has one state at a time and every downstream decision — does it
 * appear in the ledger, may it be retried, should the founder be chased —
 * follows from it. Keeping that in one pure function means the admin table,
 * the cron and the tests cannot disagree about whether the platform is owed
 * money.
 */

export type FeeState =
  | "none"        // no fee on this deal
  | "collected"   // paid, through Stripe or recorded offline
  | "outstanding" // invoiced, not paid
  | "unbillable"  // earned but never invoiced — no Stripe customer, or Stripe refused
  | "waived";     // written off on purpose

export interface FeeDeal {
  success_fee_amount: number | null;
  success_fee_invoiced: boolean | null;
  success_fee_paid_at: string | null;
  fee_billing_status: string | null;
  fee_waived_at?: string | null;
  closed_at?: string | null;
  fee_reminder_count?: number | null;
  fee_reminder_last_at?: string | null;
}

export function feeState(d: FeeDeal): FeeState {
  if (d.success_fee_amount == null || Number(d.success_fee_amount) <= 0) return "none";
  if (d.fee_waived_at || d.fee_billing_status === "waived") return "waived";
  if (d.success_fee_paid_at || d.fee_billing_status === "paid_offline") return "collected";
  if (d.fee_billing_status === "no_customer" || d.fee_billing_status === "failed") return "unbillable";
  if (d.success_fee_invoiced) return "outstanding";
  // Amount recorded, never invoiced, no failure noted: still unbillable — the
  // platform is owed money and no invoice exists. Silence is not "collected".
  return "unbillable";
}

/** success_fee_amount is stored in minor units. */
export function feeMajor(d: FeeDeal): number {
  return (Number(d.success_fee_amount) || 0) / 100;
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

export interface LedgerTotals { outstanding: number; unbillable: number; waived: number; collected: number }

export function ledgerTotals(deals: FeeDeal[]): LedgerTotals {
  const totals: LedgerTotals = { outstanding: 0, unbillable: 0, waived: 0, collected: 0 };
  for (const d of deals) {
    const s = feeState(d);
    if (s === "none") continue;
    totals[s] += feeMajor(d);
  }
  return totals;
}
