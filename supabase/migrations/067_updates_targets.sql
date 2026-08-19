-- 067 — B21 update audience + editability, B22 targets next-contact.
alter table startup_updates
  add column if not exists audience text not null default 'watchers'
    check (audience in ('watchers','deals','all')),
  add column if not exists updated_at timestamptz;

alter table investor_targets
  add column if not exists next_contact_at date;
create index if not exists investor_targets_next_idx on investor_targets(startup_id, next_contact_at) where next_contact_at is not null;
