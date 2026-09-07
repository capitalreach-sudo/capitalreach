-- 113_gates_nda_and_introductions.sql
--
-- Three things, all of which turn existing records into usable EVIDENCE.
--
-- 1. The trust gates go on. Verification that gates nothing is decoration.
-- 2. An NDA nobody can prove the terms of is a promise, not a contract.
-- 3. A fee claim needs a provable introduction date, not an inference.

-- ── A. The gates ─────────────────────────────────────────────────────────
--
--   off  -- nothing enforced (signals still recorded)
--   new  -- accounts created on or after trust_gates_since must comply;
--           everyone already here is grandfathered
--   all  -- everyone, no exceptions
--
-- Starting at "new" is not timidity: nobody is verified yet, so "all" would
-- lock every existing member out of their own conversations on the day it
-- shipped. The publish gate needs no grandfathering at all -- it fires on the
-- transition to active, so listings that are already live simply never hit it.
insert into public.platform_config (key, value) values
  ('trust_gates', 'new'),
  ('trust_gates_since', now()::text),
  -- Minimum rungs per gated action, so the policy is data and not a deploy.
  ('gate_publish_level', '3'),
  ('gate_message_level', '2'),
  ('gate_dataroom_level', '2')
on conflict (key) do nothing;

-- ── B. The NDA becomes provable ──────────────────────────────────────────
alter table public.nda_records
  -- The exact bytes agreed to. A version string alone is worthless if the
  -- wording is edited without a bump; a hash cannot be edited after the fact.
  add column if not exists text_sha256 text,
  -- Who the recipient WAS at signing. They can rename themselves later; the
  -- agreement was with the person named here, and their trust level at the
  -- time is what makes the name worth anything.
  add column if not exists counterparty jsonb,
  -- Clause 6's two years, computed once so nobody has to argue about it.
  add column if not exists obligations_end_at timestamptz;

-- What the recipient actually received under that NDA.
--
-- This is the table a founder needs on the day somebody copies their idea:
-- not "an investor had access" but "this named person opened these three
-- documents and the financials on these dates". Without it, breach is an
-- assertion. RLS is service-role only; both parties read it through routes
-- that check they are party to it.
create table if not exists public.nda_disclosures (
  id            uuid primary key default gen_random_uuid(),
  nda_record_id uuid references public.nda_records(id) on delete set null,
  startup_id    uuid not null references public.startups(id) on delete cascade,
  investor_id   uuid not null references public.investors(id) on delete cascade,
  item_type     text not null check (item_type in
                  ('data_room_open','document','financials','metrics','deck','update','message_thread')),
  item_id       uuid,
  -- Denormalised on purpose: a document deleted later must not erase the
  -- record of it having been disclosed.
  item_label    text,
  occurred_at   timestamptz not null default now(),
  ip            text,
  user_agent    text
);
create index if not exists nda_disclosures_startup_idx
  on public.nda_disclosures (startup_id, occurred_at desc);
create index if not exists nda_disclosures_investor_idx
  on public.nda_disclosures (investor_id, occurred_at desc);

-- ── C. The introduction: the basis of every fee claim ────────────────────
--
-- Non-circumvention rests entirely on being able to say "we introduced these
-- two parties on this date, and here is what they agreed to at the time".
-- The acknowledgement already captures consent; this captures the EVENT, the
-- channel it happened through, and the date the tail runs out.
create table if not exists public.introductions (
  id              uuid primary key default gen_random_uuid(),
  startup_id      uuid not null references public.startups(id) on delete cascade,
  investor_id     uuid not null references public.investors(id) on delete cascade,
  first_contact_at timestamptz not null default now(),
  channel         text not null check (channel in
                    ('message','deal','nda','interest','data_room','introduction_request')),
  -- The ack the investor gave before first contact, if there was one.
  ack_id          uuid,
  -- The window in which a round between these two parties is attributable to
  -- the platform. Written at creation so a later change to policy cannot
  -- retroactively extend somebody's obligation.
  tail_ends_at    timestamptz not null,
  terms_version   text,
  created_at      timestamptz not null default now(),
  -- One introduction per pair. The FIRST contact is the one that counts.
  unique (startup_id, investor_id)
);
-- Plain index, not partial: now() is not immutable, so it cannot sit in an
-- index predicate. The sweep filters on read instead.
create index if not exists introductions_tail_idx
  on public.introductions (tail_ends_at);

-- ── D. RLS ───────────────────────────────────────────────────────────────
alter table public.nda_disclosures enable row level security;
alter table public.introductions   enable row level security;
-- No permissive policy: both are read through routes that verify the caller
-- is party to the record, and every read is a deliberate, auditable act.

comment on table public.nda_disclosures is
  'What a recipient actually received under an NDA. The evidence behind a breach claim.';
comment on table public.introductions is
  'Provable first contact between a startup and an investor, and when the non-circumvention tail expires.';
