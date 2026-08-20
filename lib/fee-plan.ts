/**
 * Splitting the 2% success fee across a few months.
 *
 * The fee lands as one invoice on the day a round closes, which is the worst
 * day to ask a founder for cash: the money is committed and frequently not yet
 * in the account. E46 built the chasing and E47 built the disputing; neither
 * addresses the actual objection, which is timing rather than amount.
 *
 * The platform is owed the same total either way, so this is scheduling, not a
 * discount. Two properties are therefore non-negotiable and both are tested:
 * the instalments sum to the fee EXACTLY, and no month is zero.
 */

export const MIN_PLAN_MONTHS = 2;
export const MAX_PLAN_MONTHS = 6;
/** Below this there is nothing to spread — a plan on €40 is administrative noise. */
export const MIN_PLAN_FEE_MINOR = 50_000; // 500.00 in major units

export interface PlannedInstalment {
  seq: number;
  /** Minor units. */
  amount: number;
  /** ISO date (YYYY-MM-DD). */
  dueDate: string;
}

/**
 * Splits `totalMinor` into `months` payments.
 *
 * Integer minor units throughout: dividing 100001 by 3 in floating point and
 * rounding each share is how a schedule ends up one cent short of the invoice
 * it is paying. The remainder is added to the FIRST instalment rather than
 * spread — the platform takes its rounding up front, and every later payment
 * is a round, identical, predictable number.
 */
export function planInstalments(
  totalMinor: number,
  months: number,
  startISO: string,
): PlannedInstalment[] {
  if (!Number.isFinite(totalMinor) || totalMinor <= 0) return [];
  // Never more months than there are minor units to go round, or the tail of
  // the schedule is invoices for nothing. planAllowed keeps real fees well
  // clear of this, but a library that can emit a zero-value invoice will
  // eventually emit one.
  const n = Math.min(
    Math.max(MIN_PLAN_MONTHS, Math.min(MAX_PLAN_MONTHS, Math.trunc(months))),
    Math.max(1, Math.trunc(totalMinor)),
  );

  const base = Math.floor(totalMinor / n);
  const remainder = totalMinor - base * n;

  const start = new Date(`${startISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return [];

  const out: PlannedInstalment[] = [];
  for (let i = 0; i < n; i++) {
    // Month arithmetic on day-of-month 31 would skid into the next month;
    // clamping to the 28th keeps every schedule on a date that exists.
    const day = Math.min(start.getUTCDate(), 28);
    const due = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, day));
    out.push({
      seq: i + 1,
      amount: base + (i === 0 ? remainder : 0),
      dueDate: due.toISOString().slice(0, 10),
    });
  }
  return out;
}

/** A plan is only offered when the fee is big enough for the timing to matter. */
export function planAllowed(totalMinor: number | null | undefined): boolean {
  return (Number(totalMinor) || 0) >= MIN_PLAN_FEE_MINOR;
}

export interface InstalmentRow {
  seq: number;
  amount: number;
  due_date: string;
  paid_at: string | null;
}

export interface PlanProgress {
  total: number;
  paid: number;
  outstanding: number;
  paidCount: number;
  count: number;
  /** Instalments due in the past and still unpaid. The number that matters. */
  overdue: InstalmentRow[];
  complete: boolean;
}

export function planProgress(rows: InstalmentRow[], now: Date = new Date()): PlanProgress {
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const paidRows = rows.filter(r => !!r.paid_at);
  const paid = paidRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const today = now.toISOString().slice(0, 10);
  return {
    total,
    paid,
    outstanding: total - paid,
    paidCount: paidRows.length,
    count: rows.length,
    overdue: rows.filter(r => !r.paid_at && r.due_date <= today),
    // An empty schedule is not a completed one: "no instalments" must never
    // read as "fully paid" to the ledger.
    complete: rows.length > 0 && paidRows.length === rows.length,
  };
}
