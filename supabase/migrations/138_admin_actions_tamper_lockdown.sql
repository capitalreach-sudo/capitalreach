-- 138: admin_actions is the audit trail for everything an admin does
-- (approve, suspend, tier-change, impersonation view...). migration 001 gave
-- it one policy, admin_actions_admin, FOR ALL USING (role = 'admin') with no
-- WITH CHECK. Postgres RLS treats a FOR ALL / FOR UPDATE / FOR INSERT policy
-- with no explicit WITH CHECK as reusing its USING clause for that check --
-- and USING here names only the caller's role, never anything about the row
-- being written. That means the same policy that lets an admin SELECT the
-- log also lets any admin (any admin_level: support included, not just
-- owner) UPDATE or DELETE any row in it with a plain PostgREST call, no app
-- route involved. Live-probed and confirmed.
--
-- No application code needs this: every admin_actions write in the app goes
-- through createAdminClient() (the service role), which bypasses RLS
-- entirely and is unaffected by anything below. This closes the hole for the
-- `authenticated` role only, which is exactly where it was open.
--
-- Fix: replace the FOR ALL policy with an INSERT-only one scoped the same
-- way (role = 'admin'), matched with an explicit WITH CHECK so it cannot be
-- reused for UPDATE/DELETE. admin_actions_admin_read (017) already covers
-- SELECT and is untouched. No UPDATE or DELETE policy is added for
-- `authenticated` at all -- RLS enabled with no permissive policy for a
-- command means that command is refused outright for every non-service-role
-- caller, which is the correct behaviour for an audit log: nothing
-- legitimate ever needs to rewrite or erase a row in it from a client
-- session.
DROP POLICY IF EXISTS "admin_actions_admin" ON admin_actions;

CREATE POLICY "admin_actions_admin_insert" ON admin_actions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
