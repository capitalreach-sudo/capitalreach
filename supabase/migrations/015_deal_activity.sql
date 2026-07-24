-- ─── DEAL ACTIVITY ──────────────────────────────────────────────────────────
-- Chronological activity feed per deal: manual notes plus automatic entries
-- for status changes, contract status changes, and NDA signatures. Both deal
-- participants can view and add notes. Idempotent.

CREATE TABLE IF NOT EXISTS deal_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'note'
    CHECK (type IN ('note','status_change','contract_status','nda_signed')),
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deal_activity_deal_idx ON deal_activity(deal_id, created_at DESC);

ALTER TABLE deal_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_activity_participants" ON deal_activity;
CREATE POLICY "deal_activity_participants" ON deal_activity FOR ALL USING (
  EXISTS (SELECT 1 FROM startups s  WHERE s.id = deal_activity.startup_id  AND s.owner_id = auth.uid())
  OR
  EXISTS (SELECT 1 FROM investors i WHERE i.id = deal_activity.investor_id AND i.owner_id = auth.uid())
);
