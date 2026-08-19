-- 084 — F: invites.
--
-- A two-sided marketplace has one problem before it has any others: the
-- founders are here because the investors are, and vice versa. The only way
-- anyone joined was finding the site. Everybody on it already knows people on
-- the other side — founders have investors who passed, investors have
-- founders they liked but could not fund — and there was no way to bring them.
--
-- Deliberately a LINK, not an email send. The platform has no mail domain yet
-- (see lib/brand), and an invite that silently fails to send is worse than no
-- invite. The inviter copies a link and sends it themselves, through the
-- relationship that makes the invite worth anything.
create table if not exists invites (
  id           uuid primary key default gen_random_uuid(),
  inviter_id   uuid not null references auth.users(id) on delete cascade,
  code         text not null unique,
  invite_role  text not null check (invite_role in ('startup','investor')),
  note         text,
  -- Set when somebody signs up through the link. One accepted signup per
  -- invite, so an invite is a countable act rather than a broadcast.
  accepted_by  uuid references auth.users(id) on delete set null,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists invites_inviter_idx on invites(inviter_id, created_at desc);
create index if not exists invites_code_idx on invites(code) where accepted_at is null and revoked_at is null;

alter table invites enable row level security;
-- An inviter manages their own invites. Looking an invite UP by code happens
-- server-side through the service role: a policy that let anyone read by code
-- would also let anyone enumerate who invited whom.
drop policy if exists invites_own on invites;
create policy invites_own on invites for all to authenticated
  using (inviter_id = auth.uid()) with check (inviter_id = auth.uid());

-- Attribution on the profile, so "who brought this member" survives the
-- invite row being deleted with its inviter.
alter table profiles
  add column if not exists invited_by uuid,
  add column if not exists invite_code text;
