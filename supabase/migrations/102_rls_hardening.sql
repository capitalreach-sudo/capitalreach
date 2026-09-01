-- 102: RLS hardening from the production audit.
--
-- CRITICAL: stripe_events had RLS OFF and anon held full DML incl. TRUNCATE —
-- an unauthenticated caller could forge event ids (block real webhooks) or
-- wipe processed-event records (force webhook replay → double fee invoices).
-- It is a service-role-only idempotency table; lock it shut.
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;
-- No policies added: with RLS on and no policy, only the service role (which
-- bypasses RLS) can touch it — exactly the intended access.

-- startup_updates: the read policy was USING(true), ignoring the row's
-- audience and the parent listing's status — a future investors-only or
-- draft update would leak to anon. Scope it to public updates on live listings.
drop policy if exists startup_updates_read on public.startup_updates;
create policy startup_updates_read on public.startup_updates for select using (
  audience = 'all'
  and exists (select 1 from public.startups s where s.id = startup_updates.startup_id and s.status = 'active')
);

-- threads: an INSERT policy of WITH CHECK(true) for role public let anyone
-- (even signed-out) create thread rows — spam/flooding. Require a real
-- session; participant ownership is already enforced by the app's insert path.
drop policy if exists "Anyone can create a thread" on public.threads;
create policy threads_authenticated_insert on public.threads for insert
  with check (auth.uid() is not null);

-- platform_config: world-readable is fine for launch_mode/member_count today,
-- but the first secret dropped here would be anon-readable. Restrict reads to
-- the two known-public keys; anything else needs the service role.
drop policy if exists platform_config_read on public.platform_config;
create policy platform_config_read on public.platform_config for select using (
  key in ('launch_mode', 'member_count', 'launch_target')
);
