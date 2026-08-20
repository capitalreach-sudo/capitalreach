-- 087 — paying the 2% success fee over a few months.
--
-- The fee lands as one invoice on the day a round closes, which is the single
-- worst day to ask a founder for cash: the money is committed but frequently
-- not yet in the account, and the wire from the investor can be weeks behind
-- the signature. E46 built a ledger for chasing that invoice and E47 built a
-- way to dispute it; neither addresses the actual objection, which is timing
-- rather than amount.
--
-- An instalment plan splits the fee across up to six months. The platform is
-- owed the same money either way, so this is a scheduling change, not a
-- discount — and the schedule has to add up to the fee exactly, for the same
-- reason a tranche schedule has to add up to the deal.
create table if not exists fee_instalments (
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid not null references deals(id) on delete cascade,
  seq            int not null,
  -- Minor units, as success_fee_amount is stored and as Stripe holds it.
  amount         bigint not null check (amount > 0),
  due_date       date not null,
  paid_at        timestamptz,
  -- Set once this instalment has actually been raised in Stripe.
  stripe_invoice_id text,
  billing_error  text,
  created_at     timestamptz not null default now(),
  unique (deal_id, seq)
);
create index if not exists fee_instalments_due_idx
  on fee_instalments(due_date) where paid_at is null;
create index if not exists fee_instalments_deal_idx on fee_instalments(deal_id, seq);

-- How many months the plan runs. Null means the fee is a single payment, which
-- stays the default: a plan is something a founder asks for.
alter table deals
  add column if not exists fee_plan_months     int check (fee_plan_months between 2 and 6),
  add column if not exists fee_plan_started_at timestamptz;

alter table fee_instalments enable row level security;
-- The founder whose company owes the fee may read their own schedule; nobody
-- else reaches this table except the service role behind the fee routes.
-- Deliberately SELECT only: the amounts and the dates are set by the platform,
-- and a payer who can edit their own payment schedule does not have one.
drop policy if exists fee_instalments_own_read on fee_instalments;
create policy fee_instalments_own_read on fee_instalments
  for select to authenticated
  using (exists (
    select 1 from deals d
    join startups s on s.id = d.startup_id
    where d.id = fee_instalments.deal_id and s.owner_id = auth.uid()
  ));
