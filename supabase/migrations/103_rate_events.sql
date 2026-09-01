-- 103: a Redis-independent rate limiter. Upstash fails OPEN when unconfigured
-- (prod has no Redis), so every notify/email-triggering route was unmetered —
-- message/proposal/question spam and delete-then-re-signal notify-bombs. This
-- table + lib/db-rate-limit count real events in a time window, in Postgres,
-- so the ceiling holds regardless of Redis.
create table if not exists public.rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_lookup on public.rate_events (user_id, action, created_at desc);
alter table public.rate_events enable row level security;
-- Service-role only (routes write/read via createAdminClient); no anon/authed policy.
revoke all on public.rate_events from anon, authenticated;
