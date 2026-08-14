/**
 * How a round's closing date should read on a listing, if at all.
 *
 * One function rather than per-surface date math so the browse card, the
 * detail page and the dashboard can never disagree about what "closing soon"
 * means. The states, and why each exists:
 *
 *  - null: no date set (rolling round), or more than 60 days out. A countdown
 *    two months long is not urgency, it is wallpaper -- showing it would
 *    train investors to ignore the badge on every listing.
 *  - "closingSoon": date has passed or is today. NOT "closed X days ago":
 *    founders forget to update fields, and a stale "closed 12 days ago" on a
 *    live listing reads as abandonment. If the round truly closed, the
 *    listing itself gets closed; until then the platform gives the founder
 *    the benefit of the doubt.
 *  - days N: 1..60 days remaining, the actual countdown.
 */
export type RoundCloseState =
  | { kind: "days"; days: number; urgent: boolean }
  | { kind: "closingSoon" }
  | null;

export function roundCloseState(date: string | null | undefined, now = new Date()): RoundCloseState {
  if (!date) return null;
  // Calendar-day arithmetic, not wall-clock: "closes on the 14th" means the
  // same thing in every timezone, and the 60-day cutoff must not flip
  // depending on where the server happens to run. Both sides are collapsed
  // to a UTC date before subtracting.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return null;
  const closeUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(closeUtc)) return null;
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  // +1: the close date is inclusive. "Closes on the 14th", read on the 14th,
  // is "1 day left", not "closed".
  const days = Math.round((closeUtc - nowUtc) / 86_400_000) + 1;
  if (days <= 0) return { kind: "closingSoon" };
  if (days > 60) return null;
  // Under two weeks is when a decision actually has to move.
  return { kind: "days", days, urgent: days <= 14 };
}
