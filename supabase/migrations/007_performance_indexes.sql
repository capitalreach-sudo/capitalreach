-- Performance indexes for foreign-key lookup columns that are queried frequently
-- but have no indexes in the initial schema.

CREATE INDEX IF NOT EXISTS idx_startups_owner_id    ON startups (owner_id);
CREATE INDEX IF NOT EXISTS idx_investors_owner_id   ON investors (owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_startup_id     ON deals (startup_id);
CREATE INDEX IF NOT EXISTS idx_deals_investor_id    ON deals (investor_id);
CREATE INDEX IF NOT EXISTS idx_ai_reports_startup_id ON ai_reports (startup_id);
-- The saved-startups feature is the `watchlists` table, keyed by investor_id.
-- These two lines previously referenced `saved_startups (user_id)`, a table
-- that has never existed in this schema, so the whole migration aborted with
-- 42P01 on any fresh database. IF NOT EXISTS guards the index name, not the
-- table it is built on.
--
-- watchlists already has UNIQUE(investor_id, startup_id), whose backing index
-- covers lookups by investor, so only the reverse direction needs adding.
CREATE INDEX IF NOT EXISTS idx_watchlists_startup_id ON watchlists (startup_id);
