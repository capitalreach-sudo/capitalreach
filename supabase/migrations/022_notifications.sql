-- 022: in-app notifications.
--
-- Nothing in this product tells anyone that anything happened. A deal opens, a
-- stage moves, a follow-up falls due, a message arrives -- all silent. Every
-- notification path built so far goes through Resend, which needs a verified
-- domain the project does not own yet, so the entire notification layer has
-- been inert since it was written.
--
-- None of that is required for in-app. This table is the half that can ship
-- now: the email senders can read from the same rows later rather than being a
-- parallel system that drifts.
--
-- Keyed on profiles(id) rather than investors/startups deliberately -- a
-- notification belongs to a person who logs in, not to a company record.

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
    CHECK (type IN ('deal_opened','deal_stage','deal_closed','deal_passed',
                    'message','follow_up_due','contract_status','nda_signed',
                    'listing_approved','listing_rejected')),
  title       TEXT NOT NULL,
  body        TEXT,
  -- Where clicking it should go. Stored rather than derived so a notification
  -- keeps working even if the route that produced it is restructured.
  href        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The unread badge is read on every page load, so it needs to be cheap.
-- Partial index: read rows are the overwhelming majority over time and are
-- never counted.
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Read and update (marking read) your own. No insert policy for authenticated:
-- notifications are raised by server routes through the service role, and a
-- user being able to write their own notifications is only useful for faking
-- them.
DROP POLICY IF EXISTS "notifications_own_read" ON notifications;
CREATE POLICY "notifications_own_read" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_own_update" ON notifications;
CREATE POLICY "notifications_own_update" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_own_delete" ON notifications;
CREATE POLICY "notifications_own_delete" ON notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
