-- 024: allow 'team_added' as a notification type.
--
-- /api/team raises a notification when someone is added to a team, but 022's
-- CHECK has no type for it, so the route filed those under 'deal_opened' --
-- "closest existing type", per the comment it shipped with. Nothing rendered
-- the type at the time, so it cost nothing visible; now the bell groups by it,
-- and a team invite showing up as a deal event is simply wrong data.
--
-- A separate migration rather than an edit to 022, because 022 is already
-- applied to staging. Editing an applied migration means the file and the
-- database disagree, which is worse than one extra file.
--
-- Safe to run before or after 022 lands on a given database: the DO block
-- below skips silently if the table does not exist yet.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'notifications') THEN

    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
      CHECK (type IN ('deal_opened','deal_stage','deal_closed','deal_passed',
                      'message','follow_up_due','contract_status','nda_signed',
                      'listing_approved','listing_rejected','team_added'));
  END IF;
END $$;
