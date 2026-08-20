-- 092 — a waitlist on rounds that are not taking money right now.
--
-- A closed or oversubscribed round is the platform's best advertisement, and
-- until now it was a dead end: the interest it generated evaporated at the
-- moment it was most valuable. The waitlist catches it — "tell me if space
-- opens, or when they raise again" — and the round-state change that reopens
-- the round already notifies watchers, so the plumbing meets in the middle.
create table if not exists round_waitlist (
  id           uuid primary key default gen_random_uuid(),
  startup_id   uuid not null references startups(id) on delete cascade,
  investor_id  uuid not null references investors(id) on delete cascade,
  note         text,
  created_at   timestamptz not null default now(),
  unique (startup_id, investor_id)
);
create index if not exists round_waitlist_startup_idx on round_waitlist(startup_id, created_at);

alter table round_waitlist enable row level security;
-- An investor manages their own entries; the founder reads who is waiting on
-- THEIR round through the API (identity is plan-gated there, same as savers).
drop policy if exists round_waitlist_own on round_waitlist;
create policy round_waitlist_own on round_waitlist for all to authenticated
  using (exists (select 1 from investors i where i.id = round_waitlist.investor_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from investors i where i.id = round_waitlist.investor_id and i.owner_id = auth.uid()));
