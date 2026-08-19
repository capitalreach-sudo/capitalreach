-- 082 — E53 + E51: operator memory, and not every admin being every admin.
--
-- E53. Everything an operator learns about an account — "asked for an
-- extension", "second listing, first one was withdrawn", "chargeback risk" —
-- lived in their head or in Slack. admin_actions records what was DONE; there
-- was nowhere to record what was KNOWN.
create table if not exists admin_notes (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('profile','startup','investor','deal')),
  target_id   uuid not null,
  body        text not null,
  admin_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists admin_notes_target_idx on admin_notes(target_type, target_id, created_at desc);

-- No policy grants access: admin_notes is reachable only through the
-- service-role client behind requireAdmin(). RLS on with no permissive policy
-- means an ordinary session sees nothing, which is the intent — a note about
-- a user must never be readable by that user.
alter table admin_notes enable row level security;

-- E51. `role = 'admin'` was all-or-nothing: anyone who could approve a listing
-- could also suspend every account on the platform and write off fees. Three
-- levels, least privilege first.
alter table profiles
  add column if not exists admin_level text check (admin_level in ('support','operator','owner'));

-- Existing admins keep everything they had. A new admin starts at 'support'
-- unless somebody deliberately raises them.
update profiles set admin_level = 'owner' where role = 'admin' and admin_level is null;
