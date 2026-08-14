/**
 * The version of the Terms of Service currently in force, recorded with
 * every acceptance (terms_acceptances, migration 051).
 *
 * Bump this WHENEVER app/terms/page.tsx changes substantively -- the whole
 * point of the log is knowing which text a user agreed to, and a stale
 * version stamp quietly poisons every acceptance recorded after the edit.
 */
export const TERMS_VERSION = "2026-08-05"; // non-circumvention clause added
