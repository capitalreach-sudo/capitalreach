-- ─── DEAL FOLLOW-UP DATE ─────────────────────────────────────────────────────
-- Optional reminder date so deal owners can flag when to next check in on a
-- deal. Purely advisory — no automated notification is sent. Idempotent.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS next_follow_up DATE;
