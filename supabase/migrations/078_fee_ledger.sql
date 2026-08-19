-- 078 — E46: the outstanding-fee ledger and dunning.
--
-- The 2% success fee is the business model, and until now a fee that could
-- not be billed simply stopped existing. 061 recorded WHY it failed
-- ('no_customer' when the founder never set up Stripe, 'failed' when Stripe
-- rejected it) and then nothing ever looked at that column again: no retry,
-- no reminder, no way for an operator to see the list, no way to write one
-- off deliberately. Money the platform had already earned sat in a status
-- string.
--
-- These columns are what a ledger needs: whether it was chased, how often,
-- whether it was forgiven and by whom.
alter table deals
  add column if not exists fee_reminder_count   int not null default 0,
  add column if not exists fee_reminder_last_at timestamptz,
  add column if not exists fee_retry_count      int not null default 0,
  add column if not exists fee_retry_last_at    timestamptz,
  add column if not exists fee_waived_at        timestamptz,
  add column if not exists fee_waived_by        uuid,
  add column if not exists fee_waive_reason     text;

-- 'paid_offline' — a founder who pays by bank transfer has paid; the ledger
-- must be able to say so without inventing a Stripe payment. 'waived' was
-- already allowed by 061 but nothing could ever set it.
alter table deals drop constraint if exists deals_fee_billing_status_check;
alter table deals add constraint deals_fee_billing_status_check
  check (fee_billing_status in ('invoiced','no_customer','failed','waived','paid_offline'));

-- The ledger query: fees that are owed and not settled.
create index if not exists deals_fee_open_idx on deals(fee_billing_status, success_fee_paid_at)
  where success_fee_amount is not null;

-- 'fee_due' joins the notification CHECK (lockstep with lib/notify-user and
-- lib/notification-icons via tests/notification-types.test.ts).
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('deal_opened','deal_stage','deal_closed','deal_passed',
                  'message','follow_up_due','contract_status','nda_signed',
                  'listing_approved','listing_rejected','team_added',
                  'tier_changed','search_match','listing_saved','listing_update',
                  'doc_request','deal_shared','question_asked','question_answered',
                  'verified','fee_due'));
