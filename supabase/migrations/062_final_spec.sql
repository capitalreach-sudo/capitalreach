-- 062 — "Final build" spec, mapped onto the schema that actually exists.
--
-- The spec called for tables named message_threads / nda_signatures /
-- due_diligence_reports and columns named ai_score / runway / views_count.
-- Every one of those already exists here under its real name (threads,
-- nda_records, ai_reports, vaultrise_score, runway_months, pageviews), with
-- production rows in it, so this migration adds only what is genuinely
-- missing. Nothing here touches existing rows.
--
-- RLS note: anon SELECT on startups (status='active') and investors already
-- exists (001 / 003). The spec's `status='approved'` policy is NOT applied —
-- our status enum is draft/pending_review/active/suspended/archived and that
-- policy would have hidden every live listing.

-- ── Non-circumvention acknowledgments (Phase 1) ─────────────────────────────
-- One row per (investor profile, startup): the timestamped, IP-stamped
-- record that the investor accepted the 2% success-fee terms before first
-- contact. This is the legal artefact the deal audit trail points back to.
create table if not exists circumvention_acks (
  id              uuid primary key default gen_random_uuid(),
  investor_id     uuid not null references profiles(id) on delete cascade,
  startup_id      uuid not null references startups(id) on delete cascade,
  terms_version   text not null default '2026-08',
  ip_address      text,
  user_agent      text,
  acknowledged_at timestamptz not null default now(),
  unique (investor_id, startup_id)
);
create index if not exists circumvention_acks_startup_idx on circumvention_acks(startup_id, acknowledged_at desc);

alter table circumvention_acks enable row level security;
drop policy if exists "circumvention_acks_own_read" on circumvention_acks;
create policy "circumvention_acks_own_read" on circumvention_acks
  for select using (auth.uid() = investor_id);
-- Founders may see who acknowledged for their own startups (it is their record too).
drop policy if exists "circumvention_acks_founder_read" on circumvention_acks;
create policy "circumvention_acks_founder_read" on circumvention_acks
  for select using (
    exists (select 1 from startups s where s.id = circumvention_acks.startup_id and s.owner_id = auth.uid())
  );
-- Writes go through the service role only (the API stamps IP + UA server-side).

-- ── Blog / dispatch subscribers (Phase 3, /blog) ────────────────────────────
create table if not exists subscribers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  source      text default 'blog',
  confirmed   boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table subscribers enable row level security;
-- No client policies: inserts happen via the service role in /api/subscribe.

-- ── Market sizing on listings (Phase 2 detail page, Phase 6 edit tab 2) ─────
alter table startups
  add column if not exists tam numeric,
  add column if not exists sam numeric,
  add column if not exists som numeric;

-- ── Investor directory visibility (Phase 3 / Phase 6 privacy tab) ───────────
alter table investors
  add column if not exists is_public boolean not null default true;
create index if not exists investors_public_idx on investors(is_public) where is_public = true;

-- ── Deal-level circumvention pointer ────────────────────────────────────────
-- Lets a deal card show "Non-circumvention acknowledged · <ts>" without a join
-- guess: the deal remembers which ack it was opened under.
alter table deals
  add column if not exists circumvention_ack_id uuid references circumvention_acks(id) on delete set null;

-- ── Performance indexes on the real columns ─────────────────────────────────
create index if not exists startups_active_score_idx
  on startups(vaultrise_score desc nulls last) where status = 'active';
create index if not exists startups_active_mrr_idx
  on startups(mrr desc nulls last) where status = 'active';
create index if not exists startups_active_industry_idx
  on startups(industry) where status = 'active';
create index if not exists startups_active_stage_idx
  on startups(stage) where status = 'active';
create index if not exists startups_active_country_idx
  on startups(country) where status = 'active';
create index if not exists startups_active_listed_idx
  on startups(listed_at desc nulls last) where status = 'active';
create index if not exists investors_type_idx on investors(type);
