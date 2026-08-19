-- 069 — Sprint C: investor scorecards (C27), dismissal snooze (C35).

-- C27: an investor's own judgement had nowhere to live — the only score on
-- the platform was the AI's. Five criteria, 0–5 each, plus a weight per
-- criterion so a thesis that cares mostly about team can say so.
create table if not exists investor_scorecards (
  id           uuid primary key default gen_random_uuid(),
  investor_id  uuid not null references investors(id) on delete cascade,
  startup_id   uuid not null references startups(id) on delete cascade,
  scores       jsonb not null default '{}'::jsonb,   -- { team: 0-5, market: 0-5, product: 0-5, traction: 0-5, terms: 0-5 }
  weights      jsonb not null default '{}'::jsonb,   -- optional per-criterion weight, defaults to 1
  total        numeric,                              -- 0–100, computed by the API
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (investor_id, startup_id)
);
create index if not exists investor_scorecards_investor_idx on investor_scorecards(investor_id, updated_at desc);
alter table investor_scorecards enable row level security;
drop policy if exists investor_scorecards_own on investor_scorecards;
create policy investor_scorecards_own on investor_scorecards
  for all using (exists (select 1 from investors i where i.id = investor_scorecards.investor_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from investors i where i.id = investor_scorecards.investor_id and i.owner_id = auth.uid()));

-- C35: "not for me" was permanent. A snooze puts a listing back in the deck
-- when the date passes — a pre-seed pass is not a Series A pass.
alter table startup_dismissals
  add column if not exists snooze_until date,
  add column if not exists reason text;
create index if not exists startup_dismissals_snooze_idx on startup_dismissals(investor_id, snooze_until) where snooze_until is not null;
