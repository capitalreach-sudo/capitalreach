-- 027: allow 'search_match' as a notification type.
--
-- Saved searches finally alert: the daily cron compares startups listed in
-- the last day against every saved search and tells the search's owner.
-- Same shape as 024/026: swap the CHECK, no-op without the table.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'notifications') THEN

    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
      CHECK (type IN ('deal_opened','deal_stage','deal_closed','deal_passed',
                      'message','follow_up_due','contract_status','nda_signed',
                      'listing_approved','listing_rejected','team_added',
                      'tier_changed','search_match'));
  END IF;
END $$;
