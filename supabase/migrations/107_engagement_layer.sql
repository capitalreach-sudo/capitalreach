-- 107 - the engagement layer: investor profile views + profile interaction events.
--
-- Founders can see who viewed, saved and opened documents; investors could see
-- NOTHING about their own profile (no investor_views table existed at all),
-- and nobody could see clicks: website, socials, booking, video plays and
-- shares were all bare <a> tags. This closes both holes with two tables.
--
-- 1. investor_views: mirror of startup_views (017), keyed by the VIEWING USER
--    (founders and fellow investors both view investor profiles; a viewer may
--    have no investor entity). Same UTC-day dedup trick: bare ::date is only
--    STABLE so Postgres rejects it in an index; the AT TIME ZONE 'UTC' pin
--    makes it immutable.
create table if not exists investor_views (
  id          uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investors(id) on delete cascade,
  viewer_id   uuid not null references auth.users(id) on delete cascade,
  viewed_at   timestamptz not null default now()
);
create unique index if not exists investor_views_daily_idx
  on investor_views (investor_id, viewer_id, ((viewed_at at time zone 'UTC')::date));
create index if not exists investor_views_lookup
  on investor_views (investor_id, viewed_at desc);

-- Service-role only, like rate_events (103): written by the profile page
-- server-side, read by the owner-checked engagement route. No client policies.
alter table investor_views enable row level security;
revoke all on investor_views from anon, authenticated;

-- 2. profile_events: what people DID on a profile beyond looking at it.
--    One row per event, enum-checked so a client cannot invent categories.
--    viewer_id nullable: anonymous clicks count too (they are real interest).
create table if not exists profile_events (
  id          bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('startup','investor')),
  entity_id   uuid not null,
  event       text not null check (event in (
    'website_click','linkedin_click','twitter_click','producthunt_click',
    'booking_open','video_play','share_copy','share_social','onepager_open'
  )),
  viewer_id   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists profile_events_lookup
  on profile_events (entity_type, entity_id, created_at desc);

alter table profile_events enable row level security;
revoke all on profile_events from anon, authenticated;
