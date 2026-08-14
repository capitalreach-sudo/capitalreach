-- 044: system_events — the place background failures stop being silent.
--
-- Cron runs, Stripe webhooks and NDA webhooks fail into console.error or
-- .catch(() => {}), which on Vercel means "into a log stream nobody reads".
-- A cron that has been failing for a month looks identical to one that has
-- been succeeding. This table is written by those paths and read by /admin.
--
-- Service-role only: events are written by server routes and read by the
-- admin page, never by browsers. No RLS policies are created on purpose --
-- with RLS enabled and no policies, the anon and authenticated roles can do
-- nothing at all, which is exactly the intended surface.

create table if not exists system_events (
  id          uuid primary key default uuid_generate_v4(),
  source      text not null,              -- 'cron/follow-ups', 'webhook/stripe', ...
  level       text not null check (level in ('info', 'error')),
  message     text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

alter table system_events enable row level security;

-- The admin page reads "newest first, errors first" — one index serves it.
create index if not exists system_events_created_idx
  on system_events (created_at desc);

-- Old info rows are noise after a month; errors are kept until acknowledged
-- by deletion. The cron route prunes on each run rather than adding a
-- scheduled job for it.
