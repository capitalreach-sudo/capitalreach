-- Search & discovery: the columns and indexes the directories still lacked.
--
-- Deliberately NOT re-adding revenue_model, target_markets, looking_for,
-- deck_language, video_pitch_url, team_size or previous_funding: those have
-- existed since the onboarding build. This adds only what is missing, plus
-- the full-text machinery that replaces ILIKE scanning.

-- ── Startups: remaining filterable columns ────────────────────────────
ALTER TABLE startups
  ADD COLUMN IF NOT EXISTS lead_investor_status text
    CHECK (lead_investor_status IN ('have_lead','seeking_lead','open','not_raising')),
  ADD COLUMN IF NOT EXISTS founded_year integer,
  ADD COLUMN IF NOT EXISTS tags text[],
  ADD COLUMN IF NOT EXISTS languages_spoken text[];

-- ── Full-text search ──────────────────────────────────────────────────
-- Generated columns stay correct without triggers; 'simple' rather than
-- 'english' so German company names and industry words are not stemmed
-- into nothing on a bilingual marketplace.
ALTER TABLE startups
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('simple',
        coalesce(name,'') || ' ' ||
        coalesce(tagline,'') || ' ' ||
        coalesce(industry,'') || ' ' ||
        coalesce(problem,'') || ' ' ||
        coalesce(solution,''))
    ) STORED;
CREATE INDEX IF NOT EXISTS startups_search_vector_idx
  ON startups USING gin(search_vector);

-- Investors live in their own table here, not on profiles.
ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('simple',
        coalesce(display_name,'') || ' ' ||
        coalesce(firm_name,'') || ' ' ||
        coalesce(bio,'') || ' ' ||
        coalesce(type,''))
    ) STORED;
CREATE INDEX IF NOT EXISTS investors_search_vector_idx
  ON investors USING gin(search_vector);

-- ── Saved searches: both sides, both directories ──────────────────────
-- The table was investor-scoped, so a founder could not save an investor
-- search at all. user_id generalises it; investor_id stays for the rows and
-- the cron matcher that already depend on it.
ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS search_type text NOT NULL DEFAULT 'startups'
    CHECK (search_type IN ('startups','investors')),
  ADD COLUMN IF NOT EXISTS query text,
  ADD COLUMN IF NOT EXISTS alert_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS result_count integer;

-- Backfill user_id from the owning investor so existing rows work under the
-- generalised policy immediately.
UPDATE saved_searches s
  SET user_id = i.owner_id
  FROM investors i
  WHERE s.investor_id = i.id AND s.user_id IS NULL;

CREATE INDEX IF NOT EXISTS saved_searches_user_idx
  ON saved_searches(user_id, search_type);

DROP POLICY IF EXISTS saved_searches_by_user ON saved_searches;
CREATE POLICY saved_searches_by_user ON saved_searches
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Filter indexes on the live browse predicates ──────────────────────
CREATE INDEX IF NOT EXISTS startups_industry_active_idx
  ON startups(industry) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS startups_stage_active_idx
  ON startups(stage) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS startups_country_active_idx
  ON startups(country) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS startups_mrr_active_idx
  ON startups(mrr DESC NULLS LAST) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS startups_score_active_idx
  ON startups(vaultrise_score DESC NULLS LAST) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS startups_funding_active_idx
  ON startups(funding_target DESC NULLS LAST) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS investors_type_idx ON investors(type);
CREATE INDEX IF NOT EXISTS investors_lead_idx ON investors(lead_rounds);
