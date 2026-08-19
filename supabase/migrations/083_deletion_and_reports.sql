-- 083 — E49 + E50: leaving properly, and reporting what does not belong.
--
-- E49. "Delete my account" ran auth.admin.deleteUser, which cascades. For a
-- browsing user that is right. For a user who has CLOSED A DEAL it destroys
-- the counterparty's record of a transaction they were also party to, and
-- erases a success fee the platform is owed — an invoice cannot be deleted by
-- the person who owes it.
--
-- So deletion forks: erase when there is nothing to keep, anonymise when
-- there is. The account stops being a person and becomes a record.
alter table profiles
  add column if not exists deleted_at        timestamptz,
  add column if not exists deletion_reason   text,
  add column if not exists anonymised_at     timestamptz;

alter table profiles drop constraint if exists profiles_account_status_check;
alter table profiles add constraint profiles_account_status_check
  check (account_status in ('active','suspended','banned','pending','deleted'));

-- E50. Anyone can list anything, and there was no way to say "this is a
-- scam", "this is not their company", "this message is abuse" — the only
-- route was an email address the platform does not have yet.
create table if not exists content_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references auth.users(id) on delete set null,
  target_type  text not null check (target_type in ('startup','investor','message','question','update')),
  target_id    uuid not null,
  reason       text not null check (reason in ('spam','misleading','impersonation','abuse','not_raising','other')),
  detail       text,
  status       text not null default 'open' check (status in ('open','actioned','dismissed')),
  resolved_at  timestamptz,
  resolved_by  uuid,
  resolution   text,
  created_at   timestamptz not null default now()
);
create index if not exists content_reports_open_idx on content_reports(status, created_at desc);
create index if not exists content_reports_target_idx on content_reports(target_type, target_id);

alter table content_reports enable row level security;
-- A reporter may see what they filed and nothing else. Everything else about
-- a report — the queue, the outcome — is admin-only through the service role,
-- so the subject of a report can never read it or identify who filed it.
drop policy if exists content_reports_own on content_reports;
create policy content_reports_own on content_reports
  for select to authenticated using (reporter_id = auth.uid());
create policy content_reports_insert on content_reports
  for insert to authenticated with check (reporter_id = auth.uid());
