-- 025: read state on messages, for the navbar unread badge.
--
-- Threads here are two-party (startup side <-> investor side), so a single
-- read_at per message meaning "read by the counterpart side" is sufficient
-- and standard for DMs. Team members reading on behalf of a side counts as
-- that side having read -- same as the rest of the team model.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- The badge counts unread rows on every page load; read rows dominate over
-- time and are never counted.
CREATE INDEX IF NOT EXISTS messages_unread_idx
  ON messages (thread_id, sender_id)
  WHERE read_at IS NULL;
