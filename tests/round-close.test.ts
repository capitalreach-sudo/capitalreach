import { describe, it, expect } from "vitest";
import { roundCloseState } from "../lib/round-close";

const NOW = new Date("2026-08-14T12:00:00Z");
const inDays = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

describe("roundCloseState", () => {
  it("no date, empty date and junk are all silent", () => {
    expect(roundCloseState(null, NOW)).toBeNull();
    expect(roundCloseState(undefined, NOW)).toBeNull();
    expect(roundCloseState("not-a-date", NOW)).toBeNull();
  });

  it("more than 60 days out is silent — a two-month countdown is wallpaper", () => {
    expect(roundCloseState(inDays(60), NOW)).toBeNull();
    expect(roundCloseState(inDays(400), NOW)).toBeNull();
  });

  it("counts down inside the window, urgent under two weeks", () => {
    expect(roundCloseState(inDays(59), NOW)).toEqual({ kind: "days", days: 60, urgent: false });
    expect(roundCloseState(inDays(14), NOW)).toEqual({ kind: "days", days: 15, urgent: false });
    expect(roundCloseState(inDays(13), NOW)).toEqual({ kind: "days", days: 14, urgent: true });
    expect(roundCloseState(inDays(0), NOW)).toEqual({ kind: "days", days: 1, urgent: true });
  });

  it("today counts as the last day, not closed", () => {
    // The date is inclusive: close on the 14th, read on the 14th, is one day
    // left -- and the answer must not depend on the server's timezone, which
    // is why the model does calendar-day math on UTC dates.
    expect(roundCloseState(NOW.toISOString().slice(0, 10), NOW)).toEqual({ kind: "days", days: 1, urgent: true });
  });

  it("a past date says closing soon, never 'closed N days ago'", () => {
    // Founders forget to update fields; a stale "closed 12 days ago" on a
    // live listing reads as abandonment.
    expect(roundCloseState(inDays(-1), NOW)).toEqual({ kind: "closingSoon" });
    expect(roundCloseState(inDays(-90), NOW)).toEqual({ kind: "closingSoon" });
  });
});
