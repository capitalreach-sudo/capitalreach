-- Founder-side shortlist of investors: the mirror of watchlists.
--
-- Investors could always save startups; founders had no way to keep a target
-- list of investors they want in the round. Same shape as watchlists (pair +
-- optional note), keyed on the startup rather than the owning profile so a
-- team member managing the raise sees the same list as the founder.
create table if not exists investor_targets (
  id          uuid primary key default gen_random_uuid(),
  startup_id  uuid not null references startups(id) on delete cascade,
  investor_id uuid not null references investors(id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now(),
  unique (startup_id, investor_id)
);

alter table investor_targets enable row level security;

-- The startup's owner manages the list. (Team members go through the API,
-- which checks membership with the service role -- same split as watchlists.)
create policy investor_targets_own on investor_targets
  for all
  using (
    exists (
      select 1 from startups s
      where s.id = investor_targets.startup_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from startups s
      where s.id = investor_targets.startup_id and s.owner_id = auth.uid()
    )
  );
