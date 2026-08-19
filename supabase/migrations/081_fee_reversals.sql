-- 081 — E48: money that comes back out.
--
-- The webhook handled invoice.paid and stopped there. A success fee that was
-- refunded, or charged back by the founder's bank, stayed marked collected
-- forever — the ledger and the revenue page would keep counting money the
-- platform no longer had. Stripe fires charge.refunded and
-- charge.dispute.created for exactly this and nothing listened.
alter table deals
  add column if not exists fee_refunded_at    timestamptz,
  add column if not exists fee_refund_amount  bigint,          -- minor units
  add column if not exists fee_chargeback_at  timestamptz,
  add column if not exists fee_chargeback_resolved_at timestamptz;

alter table deals drop constraint if exists deals_fee_billing_status_check;
alter table deals add constraint deals_fee_billing_status_check
  check (fee_billing_status in (
    'invoiced','no_customer','failed','waived','paid_offline',
    -- 081: terminal Stripe outcomes that are NOT collection.
    'refunded','charged_back','uncollectible','voided'
  ));
