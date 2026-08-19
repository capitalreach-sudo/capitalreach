/**
 * D39: the one piece of tranche arithmetic that has to agree in three
 * places — the editor while you type, the API before it writes, and the
 * tests. A schedule that does not reconcile with the deal amount silently
 * changes what the deal is worth, so it is rejected rather than rounded.
 */

/** Money compared in cents: a three-way split of an odd amount must pass. */
export function toCents(n: number): number {
  return Math.round(n * 100);
}

export function scheduleTotal(amounts: Array<number | string | null | undefined>): number {
  return amounts.reduce<number>((sum, a) => {
    const n = Number(a);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
}

/**
 * True when the schedule can stand for the deal. An empty schedule is
 * vacuously fine (it means "no schedule"); a deal with no amount recorded
 * has nothing to reconcile against.
 */
export function scheduleReconciles(amounts: Array<number | string | null | undefined>, dealAmount: number | null | undefined): boolean {
  if (!amounts.length) return true;
  if (dealAmount == null || !Number.isFinite(Number(dealAmount))) return true;
  return toCents(scheduleTotal(amounts)) === toCents(Number(dealAmount));
}

/** What has actually landed, which is the number a commitment total hides. */
export function receivedTotal(tranches: Array<{ amount: number | string | null; funds_received_at: string | null }>): number {
  return scheduleTotal(tranches.filter(t => !!t.funds_received_at).map(t => t.amount));
}

export function allReceived(tranches: Array<{ funds_received_at: string | null }>): boolean {
  return tranches.length > 0 && tranches.every(t => !!t.funds_received_at);
}
