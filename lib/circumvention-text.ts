/**
 * The non-circumvention acknowledgment an investor accepts before first
 * contact with a startup (Phase 1, mechanism B). Same clickwrap approach as
 * the NDA (lib/nda-text.ts): the investor reads it, ticks the box, and the
 * acceptance is stored with IP + user agent + timestamp + this version.
 *
 * The wording used to promise a fee on "capital raised through this
 * connection ... for 24 months from today", which is unenforceable in the one
 * situation it exists for: an argument about who introduced whom. "From today"
 * is not a date anybody can produce later, "this connection" is not a defined
 * scope, and nothing said what evidence a claim would rest on or what would
 * defeat it. Every one of those is now nailed to a record:
 *
 *   -- the tail runs from the recorded introduction date (public.introductions,
 *      one row per pair, first contact wins), not from a vague "today";
 *   -- it covers the investor AND any vehicle they control or advise, because
 *      the obvious dodge is to close through an affiliated fund;
 *   -- the evidence is named: the introduction row, this acknowledgment, the
 *      NDA, and the disclosure log of what was actually handed over;
 *   -- and the carve-out is stated plainly, because a term with no carve-out
 *      gets read down entirely. A relationship that demonstrably predates the
 *      introduction is not ours to charge for, and the investor is invited to
 *      say so at ack time rather than after a claim, when it is worth less.
 *
 * Bump CIRCUMVENTION_TERMS_VERSION whenever the wording changes. Acks and
 * introductions both stamp the version in force when they were made, so an
 * older acceptance is never reinterpreted under newer terms.
 */
export const CIRCUMVENTION_TERMS_VERSION = "2026-09-07";

export const SUCCESS_FEE_PERCENT = 2;
export const NON_CIRCUMVENTION_MONTHS = 24;

/**
 * The clauses, in reading order, as i18n keys. The modal renders this list
 * rather than its own hardcoded array, so a clause added here appears in the
 * acknowledgment without a second edit -- and the terms a person agreed to
 * cannot silently drift from the terms this module says they agreed to.
 *
 * Interpolation params for the whole set are CIRCUMVENTION_PARAMS.
 */
export const CIRCUMVENTION_CLAUSE_KEYS = [
  "circumvention.bullet1",
  "circumvention.bullet2",
  "circumvention.bullet3",
  "circumvention.bullet4",
  "circumvention.bullet5",
] as const;

/** Every clause takes the same params, so no caller has to know which. */
export const CIRCUMVENTION_PARAMS = {
  fee: SUCCESS_FEE_PERCENT,
  months: NON_CIRCUMVENTION_MONTHS,
} as const;

export interface CircumventionTermsInput {
  companyName?: string | null;
  /** The recorded introduction date, when there already is one. */
  introducedAt?: string | Date | null;
  /** Recorded tail expiry, so the document states the date rather than a sum. */
  tailEndsAt?: string | Date | null;
}

function asDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asDay(v: string | Date | null | undefined, fallback: string): string {
  const d = asDate(v);
  return d ? d.toISOString().slice(0, 10) : fallback;
}

/**
 * The full undertaking, as the text of record.
 *
 * Rendered rather than stored so it can be hashed the way nda_records hashes
 * its NDA text: a version string alone proves nothing if the wording is edited
 * without a bump, and a hash of these exact bytes cannot be edited after the
 * fact. Dates are rendered as ISO days -- this is evidence, not a UI, and a
 * locale-formatted date in a legal record is ambiguous by construction.
 */
export function circumventionTerms(input: CircumventionTermsInput = {}): string {
  const company = input.companyName?.trim() || "the Company";
  const introduced = asDay(input.introducedAt, "the date of first contact recorded by CapitalReach");
  const tailEnds = asDay(input.tailEndsAt, `${NON_CIRCUMVENTION_MONTHS} months after that date`);

  return `NON-CIRCUMVENTION UNDERTAKING

In consideration of CapitalReach introducing the accepting party ("the
Investor") to ${company} ("the Company"), the Investor agrees:

1. THE INTRODUCTION. CapitalReach records the first contact between the
   Investor and the Company as an introduction, with its date, the channel it
   happened through, and the version of these terms in force at the time. That
   recorded date -- ${introduced} -- is the date from which everything below
   runs. It is fixed at the moment of introduction and is not restated by any
   later change to these terms.

2. THE FEE. A ${SUCCESS_FEE_PERCENT}% success fee is due to CapitalReach on capital the Company
   raises from the Investor where the round closes on or before ${tailEnds},
   being ${NON_CIRCUMVENTION_MONTHS} months from the recorded introduction date. The fee is charged
   to the Company. It is never charged to the Investor.

3. WHERE IT CLOSES MAKES NO DIFFERENCE. The fee applies whether the round is
   documented on this platform, by email, through a lawyer, or anywhere else.
   Moving the conversation off CapitalReach does not end the obligation; it
   only removes the platform's convenience.

4. AFFILIATES. The undertaking covers a round closed with the Investor and a
   round closed with any fund, syndicate, special purpose vehicle, employer or
   other entity the Investor controls, manages, advises, or brings to the
   Company on the strength of this introduction. Substituting an affiliate for
   the Investor does not defeat it.

5. EVIDENCE. A claim under this undertaking rests on CapitalReach's own
   records: the introduction record and its date, this acknowledgment with its
   timestamp, IP address and terms version, any confidentiality undertaking the
   Investor accepted for the Company, and the log of what was actually
   disclosed to the Investor under it. Those records are kept for the life of
   the undertaking and are producible to either party on request.

6. WHAT IS NOT COVERED. This undertaking does not apply to:
   (a) a relationship between the Investor and the Company that demonstrably
       predates the recorded introduction date -- a prior investment, a term
       sheet, a signed NDA, or documented substantive contact;
   (b) capital raised from a party the Investor did not introduce and does not
       control, manage or advise; or
   (c) a round closing after the date in clause 2.
   The Investor may declare a predating relationship when acknowledging these
   terms, and is encouraged to. A declaration made at introduction is evidence;
   the same account of events offered after a fee is claimed is an argument.

7. NO EXCLUSIVITY. Nothing here restricts whom the Investor may invest in, or
   the Company may raise from. It fixes only what is owed to CapitalReach for
   an introduction it made.

By accepting, the Investor confirms they have read and agree to these terms.`;
}
