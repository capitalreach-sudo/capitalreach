-- 080 — E47: contesting a success fee.
--
-- E46 gave the operator a ledger and three reminders. The other side of that
-- conversation did not exist: a founder got an invoice for 2% of their round
-- and had no way to say "the round did not close at that amount" except by
-- ignoring the reminders, which the platform then read as non-payment.
--
-- A dispute is a state, not a message. It pauses dunning, shows up in the
-- ledger, and has to be resolved by a person either way.
alter table deals
  add column if not exists fee_disputed_at       timestamptz,
  add column if not exists fee_dispute_reason    text,
  add column if not exists fee_dispute_resolved_at timestamptz,
  add column if not exists fee_dispute_resolution  text;

create index if not exists deals_fee_disputed_idx on deals(fee_disputed_at)
  where fee_disputed_at is not null and fee_dispute_resolved_at is null;
