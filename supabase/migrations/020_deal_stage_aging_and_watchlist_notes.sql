-- 020: pipeline aging and a usable watchlist.
--
-- stage_entered_at answers the question every pipeline review starts with:
-- not "what stage is this in" but "how long has it been sitting there".
-- deals.updated_at can't answer it -- adding a note or a contract bumps that
-- row without the stage having moved, so a deal that has been stuck in
-- Diligence for three months can look freshly touched.
--
-- Backfilled from the most recent status_change in deal_activity where one
-- exists, falling back to created_at. That is the honest reconstruction: for
-- deals whose stage never changed, the stage was entered when the deal was
-- created.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ;

UPDATE deals d
SET stage_entered_at = COALESCE(
  (SELECT MAX(a.created_at)
     FROM deal_activity a
    WHERE a.deal_id = d.id
      AND a.type = 'status_change'),
  d.created_at
)
WHERE d.stage_entered_at IS NULL;

ALTER TABLE deals
  ALTER COLUMN stage_entered_at SET DEFAULT NOW();

-- Sorting and filtering the board by how stale a stage is.
CREATE INDEX IF NOT EXISTS idx_deals_stage_entered_at
  ON deals (stage_entered_at);

-- ── Success fee as a timeline event ─────────────────────────────────────────
-- deal_activity logged status changes, notes, contracts and NDAs -- but not
-- the invoice, which is the only entry on the timeline that involves money
-- changing hands. A participant reading the history saw the deal close and no
-- record of what they were billed.
ALTER TABLE deal_activity
  DROP CONSTRAINT IF EXISTS deal_activity_type_check;

ALTER TABLE deal_activity
  ADD CONSTRAINT deal_activity_type_check
  CHECK (type IN ('note','status_change','contract_status','nda_signed','success_fee'));

-- ── Watchlist notes ─────────────────────────────────────────────────────────
-- The watchlist was a flat list of bookmarks with no reason attached. Past
-- twenty or so saves that stops being a shortlist and becomes a pile.
ALTER TABLE watchlists
  ADD COLUMN IF NOT EXISTS note TEXT;
