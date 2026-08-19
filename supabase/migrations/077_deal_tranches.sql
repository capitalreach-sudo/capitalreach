-- 077 — D39: a commitment paid in instalments.
--
-- Funding was a single event: money left, money arrived, done. Real rounds
-- are often tranched — half on close, half on a milestone — and the platform
-- had nowhere to put that. Founders were left tracking it in a spreadsheet,
-- and the raise tracker counted the full commitment as though it had all
-- landed.
--
-- A tranche is a scheduled part of one deal's amount. The two one-way
-- confirmations from 073 apply per tranche; the deal is funded when every
-- tranche is received. No bank details here either, by design.
create table if not exists deal_tranches (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null references deals(id) on delete cascade,
  position          int not null default 0,
  label             text,
  amount            numeric not null check (amount > 0),
  due_date          date,
  condition         text,
  funds_sent_at     timestamptz,
  funds_sent_by     uuid references auth.users(id) on delete set null,
  funds_received_at timestamptz,
  funds_received_by uuid references auth.users(id) on delete set null,
  reference         text,
  created_at        timestamptz not null default now()
);
create index if not exists deal_tranches_deal_idx on deal_tranches(deal_id, position);

alter table deal_tranches enable row level security;
-- Mirrors the deal's own visibility by joining through it: the subquery is
-- itself RLS-filtered, so a row is reachable exactly when its deal is.
drop policy if exists deal_tranches_via_deal on deal_tranches;
create policy deal_tranches_via_deal on deal_tranches for all
  using (exists (select 1 from deals d where d.id = deal_tranches.deal_id))
  with check (exists (select 1 from deals d where d.id = deal_tranches.deal_id));
