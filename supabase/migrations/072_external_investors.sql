-- 072 — B18: off-platform investors.
--
-- A founder's existing angel will never make an account, but they are part
-- of the round and belong in the pipeline and the raise total. Rather than a
-- parallel "external contacts" table (which would need its own deal type,
-- its own commitment tracking, its own checklist…), an external contact is
-- an investors row with no owner: every existing deal, commitment,
-- checklist, activity and raise-tracker feature then works on it unchanged.
--
-- The privacy consequence is the whole point of this migration: these rows
-- are a founder's private contact list and must never be readable by the
-- rest of the platform, so the blanket "investors_public" SELECT policy is
-- replaced with one that excludes them.

alter table investors alter column owner_id drop not null;
alter table investors
  add column if not exists is_external boolean not null default false,
  add column if not exists managed_by_startup_id uuid references startups(id) on delete cascade,
  add column if not exists contact_email text,
  add column if not exists contact_note text;

-- An external row has no owner and always has a manager; a real investor
-- account always has an owner and never a manager.
alter table investors drop constraint if exists investors_external_shape;
alter table investors add constraint investors_external_shape check (
  (is_external = true  and owner_id is null and managed_by_startup_id is not null)
  or
  (is_external = false and owner_id is not null and managed_by_startup_id is null)
);

create index if not exists investors_external_idx on investors(managed_by_startup_id) where is_external = true;

-- ── SELECT policies ────────────────────────────────────────────────────────
-- Real investor rows stay world-readable (the directory depends on it).
drop policy if exists investors_public on investors;
create policy investors_public on investors
  for select using (is_external = false);

-- An external contact is visible only to the startup that created it.
drop policy if exists investors_external_manager on investors;
create policy investors_external_manager on investors
  for select using (
    is_external = true
    and exists (select 1 from startups s where s.id = investors.managed_by_startup_id and s.owner_id = auth.uid())
  );

-- Same rule for updates (the owner-based policies can never match a null owner).
drop policy if exists investors_external_manager_update on investors;
create policy investors_external_manager_update on investors
  for update using (
    is_external = true
    and exists (select 1 from startups s where s.id = investors.managed_by_startup_id and s.owner_id = auth.uid())
  );
