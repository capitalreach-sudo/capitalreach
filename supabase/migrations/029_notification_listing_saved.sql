-- Grow the notification type CHECK to allow 'listing_saved'.
--
-- Raised when an investor adds a founder's startup to their watchlist. The
-- notification is deliberately identity-free ("An investor saved your
-- listing") -- naming the investor is a paid capability surfaced by the
-- Who-saved-you panel, so the free notification nudges the upgrade instead of
-- giving the answer away.
--
-- Kept in lockstep with the NotificationType union (lib/notify-user) and
-- TYPE_ICON (lib/notification-icons) by tests/notification-types.test.ts.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('deal_opened','deal_stage','deal_closed','deal_passed',
                  'message','follow_up_due','contract_status','nda_signed',
                  'listing_approved','listing_rejected','team_added',
                  'tier_changed','search_match','listing_saved'));
