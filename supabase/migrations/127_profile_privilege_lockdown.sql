-- 127 - a member cannot promote themselves.
--
-- profiles_own_update is FOR UPDATE USING (auth.uid() = id) with NO WITH CHECK,
-- and `authenticated` holds table-level UPDATE on every column of profiles.
-- A USING clause without a WITH CHECK decides WHICH ROW you may write, never
-- WHICH VALUES you may write into it. So the row a member is allowed to edit
-- is their own, and the columns they were free to edit included role,
-- admin_level, suspended, account_status, subscription_tier and tier_override.
--
-- What that permitted, with nothing but the publishable key and an ordinary
-- password session:
--
--   PATCH /rest/v1/profiles?id=eq.<self>   {"role":"admin","admin_level":"owner"}
--
-- lib/admin-guard.ts reads role and admin_level with the SERVICE ROLE, and its
-- comment says that is so "an RLS misconfiguration on profiles must never be
-- able to turn into a privilege escalation". Reading with the service role
-- does not help when the caller can write the value being read. The same
-- applies to lib/suspension-guard.ts: a suspended account could clear its own
-- suspension and account_status and walk back in, and to subscription_tier and
-- tier_override, which decide what a plan is allowed to see.
--
-- WHY A TRIGGER AND NOT A WITH CHECK, WHICH IS THE OBVIOUS FIX. A WITH CHECK
-- comparing each column to its OLD value cannot be written: policy expressions
-- see only the candidate row, never the existing one. The alternative is
-- revoking UPDATE on the six columns, and 109 documents why that is the wrong
-- instrument here -- revoking one column converts the table-level grant into a
-- frozen column list, every column added afterwards becomes silently
-- unwritable, and 112 and 117 each paid for that. The trigger has no such
-- edge, and the function already exists: 125 wrote
-- reject_client_column_write() for exactly this shape and 126 reused it.
--
-- Service-role writes pass, because the function returns early when
-- auth.uid() is null. That is every legitimate writer of these columns: the
-- Stripe webhook setting subscription_tier, admin-guard suspending an account,
-- the admin console changing a level. handle_new_user, which sets role at
-- signup, is SECURITY DEFINER and INSERTs rather than UPDATEs, and this
-- trigger guards UPDATE only, so signup is untouched.
--
-- Checked before enabling: the only client-key writes to profiles anywhere in
-- the app are muted_notification_types (dashboard settings), the investor
-- profile fields plus accreditation_certified (investor settings), and
-- investor_declarations plus full_name (investor onboarding). None of them
-- names a column below, so nothing a member can legitimately do is affected.

drop trigger if exists profiles_privilege_server_only on public.profiles;
create trigger profiles_privilege_server_only
  before update on public.profiles
  for each row execute function public.reject_client_column_write(
    'role', 'admin_level', 'suspended', 'suspended_until', 'suspended_reason',
    'suspended_by', 'account_status', 'subscription_tier', 'tier_override'
  );

comment on trigger profiles_privilege_server_only on public.profiles is
  'Blocks a client-key UPDATE that changes role, admin level, suspension or plan. The row policy says which row; this says which columns.';
