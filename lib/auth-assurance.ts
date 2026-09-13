import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The second factor, enforced where authentication happens -- not only at page
 * navigation.
 *
 * signInWithPassword issues a real, cookie-backed session at AAL1 the moment
 * the password is accepted, BEFORE the TOTP code is submitted. The page
 * middleware turned that session away from /dashboard, /admin and friends, but
 * every API route authenticated with getUser() alone, which is satisfied at
 * AAL1 -- so a password-only attacker could call every mutating and admin API
 * while the second factor sat uncollected. This is the shared predicate that
 * closes that gap at the route layer.
 *
 * A user who never enrolled MFA is legitimately AAL1: their nextLevel is also
 * aal1, so they pass. Only a user who HAS a verified factor but signed in with
 * the password alone is (currentLevel aal1, nextLevel aal2) -- that is the one
 * state this rejects. Computed from the session JWT and its factor list; no
 * network round trip.
 *
 * Fails CLOSED: if the assurance level cannot be read, treat the second factor
 * as unmet. This guards writes and admin actions, where denying on doubt is
 * the safe direction, and getAuthenticatorAssuranceLevel does not touch the
 * network, so a genuine read failure is exceptional rather than routine.
 */
export async function secondFactorPending(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return true;
    return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
  } catch {
    return true;
  }
}
