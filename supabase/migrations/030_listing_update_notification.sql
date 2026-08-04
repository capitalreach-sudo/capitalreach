-- Grow the notification type CHECK to allow 'listing_update'.
--
-- Raised for every investor who saved a startup when its founder posts a new
-- milestone -- the loop that makes saving a listing worth anything: interest
-- gets fed. Kept in lockstep with the NotificationType union and TYPE_ICON by
-- tests/notification-types.test.ts.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('deal_opened','deal_stage','deal_closed','deal_passed',
                  'message','follow_up_due','contract_status','nda_signed',
                  'listing_approved','listing_rejected','team_added',
                  'tier_changed','search_match','listing_saved',
                  'listing_update'));
