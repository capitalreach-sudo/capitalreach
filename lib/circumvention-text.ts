/**
 * The non-circumvention acknowledgment an investor accepts before first
 * contact with a startup (Phase 1, mechanism B). Same clickwrap approach as
 * the NDA (lib/nda-text.ts): the investor reads it, ticks the box, and the
 * acceptance is stored with IP + user agent + timestamp + this version.
 *
 * Bump CIRCUMVENTION_TERMS_VERSION whenever the wording changes.
 */
export const CIRCUMVENTION_TERMS_VERSION = "2026-08-17";

export const SUCCESS_FEE_PERCENT = 2;
export const NON_CIRCUMVENTION_MONTHS = 24;
