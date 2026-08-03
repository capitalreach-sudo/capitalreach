-- 026: allow 'tier_changed' as a notification type.
--
-- The admin can now change a user's tier directly (comp a founder, grant an
-- investor pro); the person whose plan just changed should hear about it.
-- Same shape as 024: swap the CHECK, no-op if notifications doesn't exist.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'notifications') THEN

    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
      CHECK (type IN ('deal_opened','deal_stage','deal_closed','deal_passed',
                      'message','follow_up_due','contract_status','nda_signed',
                      'listing_approved','listing_rejected','team_added',
                      'tier_changed'));
  END IF;
END $$;
