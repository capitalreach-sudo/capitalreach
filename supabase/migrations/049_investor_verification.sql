-- 049: real investor verification, replacing the paying-customer proxy.
--
-- The directory's "verified members" filter matched subscription_tier !=
-- 'free' -- "verified" meant "pays us", which is not verification at all and
-- misleads the founders it is supposed to protect. verified_at is granted by
-- an admin after an actual check; null means unverified. The timestamp beats
-- a boolean because "verified when, by whom" is the first question the badge
-- raises.
alter table investors add column if not exists verified_at timestamptz;
-- verified_by is a bare uuid ON PURPOSE: a foreign key to profiles would be a
-- second investors->profiles relationship, making every existing
-- `profiles(...)` embed ambiguous (three routes broke the moment it existed).
-- The who-verified audit trail lives in admin_actions anyway.
alter table investors add column if not exists verified_by uuid;

-- 'verified' joins the notification CHECK (lockstep with lib/notify-user and
-- lib/notification-icons via tests/notification-types.test.ts).
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('deal_opened','deal_stage','deal_closed','deal_passed',
                  'message','follow_up_due','contract_status','nda_signed',
                  'listing_approved','listing_rejected','team_added',
                  'tier_changed','search_match','listing_saved','listing_update',
                  'doc_request','deal_shared','question_asked','question_answered',
                  'verified'));
