-- 021: saved searches.
--
-- canUseSavedSearches() has been a plan capability in lib/access.ts since the
-- tier system was written, sold on the pricing page, and backed by nothing.
-- This is the table behind it.
--
-- Filters are stored as JSONB rather than a column per filter deliberately:
-- the startup search grows new facets regularly, and a saved search that
-- silently loses a filter after a schema change is worse than one that keeps
-- an unknown key the UI ignores.

CREATE TABLE IF NOT EXISTS saved_searches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id  UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  filters      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Re-saving under a name that already exists updates it rather than growing
  -- a second entry the investor has to tell apart by eye.
  UNIQUE (investor_id, name)
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_investor
  ON saved_searches (investor_id, created_at DESC);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

-- Scoped to the owning investor, matching how watchlists are scoped. Note the
-- subquery on investors: saved_searches.investor_id references investors(id),
-- not profiles(id), and conflating those two is exactly the bug that made the
-- watchlist API silently fail for its entire existence.
DROP POLICY IF EXISTS "saved_searches_own" ON saved_searches;
CREATE POLICY "saved_searches_own" ON saved_searches
  FOR ALL
  TO authenticated
  USING (
    investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
  );

-- Suspended accounts do not get to keep working. Restrictive so it is AND-ed
-- with the ownership policy above rather than OR-ed alongside it -- the
-- mistake that made migration 017's first version decorative.
DROP POLICY IF EXISTS "saved_searches_not_suspended" ON saved_searches;
CREATE POLICY "saved_searches_not_suspended" ON saved_searches
  AS RESTRICTIVE FOR INSERT
  TO authenticated
  WITH CHECK (NOT is_suspended());
