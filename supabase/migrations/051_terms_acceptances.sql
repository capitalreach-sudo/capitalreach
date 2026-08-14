-- 051: who agreed to which Terms version, and when.
--
-- The signup form has required the checkbox from the start, but ticking it
-- recorded nothing -- if a user ever disputes that they agreed (the fee
-- clause makes this a real scenario, not a hypothetical), the platform had
-- no record to point at. Append-only on purpose: acceptances are evidence,
-- and evidence does not get updated.
--
-- version is the date of the terms text in force, maintained as a constant
-- in lib/terms-version.ts alongside the page it describes.
create table if not exists terms_acceptances (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  version     text not null,
  ip          text,
  accepted_at timestamptz not null default now()
);

alter table terms_acceptances enable row level security;

create index if not exists terms_acceptances_user_idx
  on terms_acceptances (user_id, accepted_at desc);
