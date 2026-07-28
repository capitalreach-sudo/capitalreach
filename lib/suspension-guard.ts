import { createAdminClient } from "@/lib/supabase-server";

/**
 * True when this account must not be allowed to take write actions.
 *
 * Why this exists as a one-liner helper: migration 017 enforces suspension with
 * RESTRICTIVE RLS policies, which is the right place for it -- but those
 * policies only bind the `authenticated` role. Most write routes here do their
 * insert through `createAdminClient()`, which runs as the service role and
 * bypasses RLS entirely, so the database guard never fires for them.
 *
 * Middleware doesn't cover the gap either: its suspension redirect is scoped to
 * /dashboard, /onboarding, /admin and /deals, and never runs for /api/*.
 *
 * That left an explicit per-route check as the only thing standing between a
 * suspended account and a write. `isSuspended()` in lib/access.ts needs a fully
 * built AccessContext, which is enough friction that routes skipped it. This
 * takes a user id and nothing else.
 */
export async function isAccountSuspended(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("suspended, account_status")
    .eq("id", userId)
    .maybeSingle();

  return (
    !!data?.suspended ||
    data?.account_status === "suspended" ||
    data?.account_status === "banned"
  );
}
