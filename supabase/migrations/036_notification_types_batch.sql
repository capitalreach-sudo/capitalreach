-- Four new notification kinds in one growth of the CHECK:
--   doc_request     an investor asked a founder for a document type
--   deal_shared     an investor sent a listing to another investor
--   question_asked  a question landed on a founder's listing
--   question_answered  the founder answered it
-- Lockstep with lib/notify-user and lib/notification-icons via the test.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('deal_opened','deal_stage','deal_closed','deal_passed',
                  'message','follow_up_due','contract_status','nda_signed',
                  'listing_approved','listing_rejected','team_added',
                  'tier_changed','search_match','listing_saved','listing_update',
                  'doc_request','deal_shared','question_asked','question_answered'));
