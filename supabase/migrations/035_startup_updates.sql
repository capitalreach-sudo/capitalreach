-- Investor updates: the founder's periodic narrative post, richer than a
-- milestone one-liner. Public read (the profile shows the feed to everyone
-- the listing is visible to); writes go through the API after resolveEntity
-- so team members can post, with the owner-scoped policy as backstop.
create table if not exists startup_updates (
  id         uuid primary key default gen_random_uuid(),
  startup_id uuid not null references startups(id) on delete cascade,
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists startup_updates_startup_idx on startup_updates (startup_id, created_at desc);
alter table startup_updates enable row level security;
create policy startup_updates_read on startup_updates for select using (true);
create policy startup_updates_own on startup_updates for all
  using (exists (select 1 from startups s where s.id = startup_updates.startup_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from startups s where s.id = startup_updates.startup_id and s.owner_id = auth.uid()));
