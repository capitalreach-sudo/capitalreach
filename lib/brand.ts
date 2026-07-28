/**
 * The domain the product runs on, and the addresses derived from it.
 *
 * This existed hardcoded as "capitalreach.com" in 36 places across 19 files --
 * a domain the project does not own, which is how contact-form submissions
 * ended up deliverable to a stranger's Zoho mailbox. Changing domain, or
 * acquiring the intended one, is now one environment variable.
 *
 * Deliberately its own module rather than part of lib/env: several of the
 * pages that need these addresses are client components, and lib/env reads
 * server-only secrets. Everything here is NEXT_PUBLIC_, so it is safe on both
 * sides of the boundary.
 *
 * There is no default domain. An unset BRAND_DOMAIN yields empty strings, and
 * the callers that send mail already refuse rather than guess -- a
 * plausible-looking fallback is exactly what caused the original problem.
 *
 * Known limitation: with no domain set, the legal and contact pages render
 * empty mailto: links rather than hiding them. Left as-is deliberately -- the
 * app is meant to have a domain, and conditioning fourteen render sites on a
 * state that only exists before first configuration is not worth the churn.
 */
const DOMAIN = process.env.NEXT_PUBLIC_BRAND_DOMAIN || "";

const at = (mailbox: string) => (DOMAIN ? `${mailbox}@${DOMAIN}` : "");

export const brand = {
  name: "CapitalReach",
  domain: DOMAIN,
  /** Canonical site URL. Falls back to localhost so dev links resolve. */
  url: process.env.NEXT_PUBLIC_APP_URL || (DOMAIN ? `https://${DOMAIN}` : "http://localhost:3000"),
  support: at("support"),
  billing: at("billing"),
  legal:   at("legal"),
  careers: at("careers"),
  noreply: at("noreply"),
} as const;
