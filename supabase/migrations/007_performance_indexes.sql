-- Performance indexes for foreign-key lookup columns that are queried frequently
-- but have no indexes in the initial schema.

CREATE INDEX IF NOT EXISTS idx_startups_owner_id    ON startups (owner_id);
CREATE INDEX IF NOT EXISTS idx_investors_owner_id   ON investors (owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_startup_id     ON deals (startup_id);
CREATE INDEX IF NOT EXISTS idx_deals_investor_id    ON deals (investor_id);
CREATE INDEX IF NOT EXISTS idx_ai_reports_startup_id ON ai_reports (startup_id);
CREATE INDEX IF NOT EXISTS idx_saved_startups_user  ON saved_startups (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_startups_startup ON saved_startups (startup_id);
