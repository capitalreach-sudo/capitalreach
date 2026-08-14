-- 047: login_events — our own sign-in history.
--
-- GoTrue's audit_log_entries is empty in production (audit retention is not
-- something we control), and auth.sessions only shows sign-ins whose session
-- still exists. "When and from where was this account accessed" needs a
-- record that survives sign-out, so the app writes its own on every
-- successful login. First thing anyone checks after a scare.
--
-- Service-role only (RLS enabled, no policies): written by the login flow's
-- API route, read back through an API that scopes to the caller.
create table if not exists login_events (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  ip         text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table login_events enable row level security;

create index if not exists login_events_user_idx
  on login_events (user_id, created_at desc);
