-- "Not for me": an investor hides a listing from their own browse view.
--
-- The other half of triage. Saving marks interest; until now there was no
-- way to mark the opposite, so every pass re-surfaced on every visit. One
-- row per (investor, startup); RLS scopes rows to the owning investor, so
-- the client reads and writes them directly -- no API route, nothing to
-- notify, and a founder never learns who hid them.
create table if not exists startup_dismissals (
  id          uuid primary key default gen_random_uuid(),
  investor_id uuid not null references investors(id) on delete cascade,
  startup_id  uuid not null references startups(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (investor_id, startup_id)
);

alter table startup_dismissals enable row level security;

create policy startup_dismissals_own on startup_dismissals
  for all
  using (
    exists (
      select 1 from investors i
      where i.id = startup_dismissals.investor_id and i.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from investors i
      where i.id = startup_dismissals.investor_id and i.owner_id = auth.uid()
    )
  );
