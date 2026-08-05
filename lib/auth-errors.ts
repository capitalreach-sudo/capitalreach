/**
 * Turns Supabase/GoTrue error strings into copy a person can act on.
 *
 * Every auth surface used to render `error.message` verbatim, which meant
 * users saw raw internals: "email rate limit exceeded" tells someone nothing
 * about what went wrong or what to do next, and it is always in English no
 * matter which locale the rest of the page is in.
 *
 * Matching is on substrings rather than exact strings because GoTrue's wording
 * varies by version and some messages carry an interpolated number.
 */

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Matched in order; first hit wins, so put narrower patterns first. */
const RULES: Array<{ match: RegExp; key: string }> = [
  // Rate limits. The "after N seconds" variant is GoTrue's per-address
  // cooldown; the "rate limit exceeded" one is the project-wide email cap.
  { match: /only request this after (\d+) seconds?/i, key: "authErrors.rateLimitSeconds" },
  { match: /email rate limit exceeded|over_email_send_rate_limit/i, key: "authErrors.emailRateLimit" },
  { match: /request rate limit|too many requests/i,                 key: "authErrors.tooManyRequests" },

  { match: /already registered|already been registered|user_already_exists/i, key: "authErrors.alreadyRegistered" },
  { match: /invalid login credentials/i,                            key: "authErrors.invalidCredentials" },
  { match: /email not confirmed|email_not_confirmed/i,              key: "authErrors.emailNotConfirmed" },
  { match: /password should be at least (\d+)/i,                    key: "authErrors.passwordTooShort" },
  { match: /password.*(weak|compromised|pwned)/i,                   key: "authErrors.passwordWeak" },
  // GoTrue's live message is 'Email address "x" is invalid' -- the code
  // (email_address_invalid) never reaches the message string the caller
  // passes, so the pattern must match the sentence too. Found when a fresh
  // signup on staging fell through to the generic error.
  { match: /unable to validate email|invalid email|email_address_invalid|email address.*is invalid/i, key: "authErrors.invalidEmail" },
  { match: /signups? not allowed|signup_disabled/i,                 key: "authErrors.signupsDisabled" },
  { match: /token has expired|otp_expired|invalid.*token/i,         key: "authErrors.linkExpired" },
  { match: /same.*password|new password should be different/i,      key: "authErrors.samePassword" },

  // Network/transport rather than auth. `fetch` shows up when the Supabase
  // host is unreachable or the URL is misconfigured.
  { match: /failed to fetch|networkerror|fetch/i,                   key: "authErrors.unreachable" },
];

export function authErrorMessage(error: unknown, t: Translate): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "";

  if (!raw) return t("authErrors.generic");

  for (const rule of RULES) {
    const m = raw.match(rule.match);
    if (!m) continue;
    // Rules whose pattern captures a number feed it to the copy, so the user
    // is told how long to wait rather than just that they must.
    return m[1] ? t(rule.key, { n: m[1] }) : t(rule.key);
  }

  // Unrecognised: a generic line rather than the raw string. Anything genuinely
  // new is in the console for us and is not something a user could act on.
  console.error("[auth] unmapped error:", raw);
  return t("authErrors.generic");
}
