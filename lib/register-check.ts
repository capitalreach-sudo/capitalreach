import { SUCCESS_FEE_PERCENT } from "@/lib/circumvention-text";

/**
 * The round, checked against the public record.
 *
 * A closed amount is whatever the pair typed. Both of them had to agree it, so
 * neither states it alone, but a pair with a shared interest in a smaller fee
 * can agree a smaller number together and nothing on the platform contradicts
 * them. Weeks later the company files its own account of the same round at its
 * national register, written by them and published by somebody who is not us.
 * That filing is the one number in this system that neither party to the fee
 * can edit, which is the only reason it is worth reading.
 *
 * Nothing here decides anything. It computes when to look, where to look, and
 * what a difference would be worth if an admin decided one mattered. Every
 * consequence is a person's decision taken on the queue with both figures in
 * front of them -- a filing differs from a close for honest reasons often
 * enough (a round closing in tranches, a different filing basis, a note
 * converting) that an automatic verdict would be wrong more often than right,
 * and it would be wrong against somebody's money.
 */

/**
 * How long after a close to look. Filings lag: a UK return of allotment is due
 * within a month of the allotment and a German capital change is entered when
 * the court gets to it, so a check run at close finds nothing and a check run
 * at close plus a fortnight finds nothing and teaches the reviewer to ignore
 * the queue. Ninety days clears both comfortably.
 */
export const REGISTER_CHECK_DAYS = 90;

/** Mirrors the CHECK on startups.register_type (125). */
export const REGISTER_TYPES = ["handelsregister", "companies_house", "other"] as const;
export type RegisterType = (typeof REGISTER_TYPES)[number];

/** Mirrors the CHECK on deals.register_check_status (125). */
export type RegisterCheckStatus =
  | "not_due"
  | "due"
  | "matched"
  | "discrepancy"
  | "no_filing_found";

/** The three an admin may record. 'due' and 'not_due' are scheduling states,
 *  set when a deal closes and never by a reviewer. */
export const REGISTER_VERDICTS = ["matched", "discrepancy", "no_filing_found"] as const;
export type RegisterVerdict = (typeof REGISTER_VERDICTS)[number];

export function isRegisterType(v: unknown): v is RegisterType {
  return typeof v === "string" && (REGISTER_TYPES as readonly string[]).includes(v);
}

export function isRegisterVerdict(v: unknown): v is RegisterVerdict {
  return typeof v === "string" && (REGISTER_VERDICTS as readonly string[]).includes(v);
}

/** register_check_due is a `date` column: a register publishes on a day, not
 *  at an instant, and a timestamp would invite a timezone argument about
 *  whether a filing was late. */
export function registerCheckDueDate(closedAt: Date): string {
  const due = new Date(closedAt.getTime());
  due.setUTCDate(due.getUTCDate() + REGISTER_CHECK_DAYS);
  return due.toISOString().slice(0, 10);
}

/**
 * The two columns a close writes.
 *
 * Scheduled only where there is something to compare against. A company with
 * no register entity on file cannot be checked, and queueing it anyway would
 * fill the bench with rows whose only possible outcome is "no filing found"
 * -- which reads as a finding about the founder rather than a gap in our own
 * record of them.
 */
export function registerCheckOnClose(opts: {
  closedAt: Date;
  registerType: unknown;
  registerNumber: unknown;
}): { register_check_due: string | null; register_check_status: "due" | "not_due" } {
  const hasNumber = typeof opts.registerNumber === "string" && opts.registerNumber.trim().length > 0;
  if (!isRegisterType(opts.registerType) || !hasNumber) {
    return { register_check_due: null, register_check_status: "not_due" };
  }
  return {
    register_check_due: registerCheckDueDate(opts.closedAt),
    register_check_status: "due",
  };
}

/**
 * Where a human confirms this themselves.
 *
 * Handelsregister has no public API and no stable per-company deep link: the
 * portal is session-based, so the number has to be pasted into its search by a
 * person. The link therefore goes to the search page and the UI says so
 * plainly rather than implying a lookup happened.
 */
export function registerLookupUrl(type: unknown, number: string | null | undefined): string | null {
  const num = (number ?? "").trim();
  if (!num) return null;
  if (type === "companies_house") {
    return `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(num.toUpperCase())}`;
  }
  if (type === "handelsregister") {
    return "https://www.handelsregister.de/rp_web/erweitertesuche.xhtml";
  }
  return null;
}

/** Only one register in this build answers a machine. Everything else is a
 *  person reading a page, and the queue must not pretend otherwise. */
export function registerIsQueryable(type: unknown): boolean {
  return type === "companies_house";
}

/**
 * What a supplementary fee on an under-declared round would come to.
 *
 * Display only, and the queue shows it before the admin commits so the number
 * they approve is the number that gets billed. It must stay in step with
 * lib/stripe.ts createSuccessFeeInvoice, which applies its own percentage to
 * the amount it is handed -- if SUCCESS_FEE_PERCENT ever moves, that literal
 * moves with it or the preview and the invoice disagree.
 */
export function supplementaryFeeOn(difference: number): number {
  if (!Number.isFinite(difference) || difference <= 0) return 0;
  return Math.round(difference * (SUCCESS_FEE_PERCENT / 100));
}

/** The gap between what was filed and what was declared. Positive means the
 *  company told its register a larger number than it told us. */
export function registerDifference(
  filedAmount: number | null | undefined,
  declaredAmount: number | null | undefined,
): number | null {
  if (typeof filedAmount !== "number" || !Number.isFinite(filedAmount)) return null;
  if (typeof declaredAmount !== "number" || !Number.isFinite(declaredAmount)) return null;
  return filedAmount - declaredAmount;
}
