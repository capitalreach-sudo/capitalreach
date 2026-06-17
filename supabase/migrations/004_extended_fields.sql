-- ─── Extended Investor Fields ────────────────────────────────────────────────
-- Stores data collected during investor onboarding that wasn't in the initial schema

ALTER TABLE public.investors
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS firm_name TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url TEXT,
  ADD COLUMN IF NOT EXISTS investment_thesis TEXT,
  ADD COLUMN IF NOT EXISTS aum TEXT,
  ADD COLUMN IF NOT EXISTS portfolio_json JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS follow_on_policy TEXT,
  ADD COLUMN IF NOT EXISTS board_seat_pref TEXT,
  ADD COLUMN IF NOT EXISTS lead_rounds BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS number_of_investments INTEGER,
  ADD COLUMN IF NOT EXISTS avg_hold_period TEXT;

-- Full-text index for investor search by display/firm name
CREATE INDEX IF NOT EXISTS investors_name_idx
  ON investors USING gin(
    to_tsvector('english',
      coalesce(display_name,'') || ' ' ||
      coalesce(firm_name,'') || ' ' ||
      coalesce(bio,'')
    )
  );

-- ─── Extended Startup Fields ──────────────────────────────────────────────────
-- Stores data collected during startup onboarding that wasn't in the initial schema

ALTER TABLE public.startups
  ADD COLUMN IF NOT EXISTS founded_date DATE,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS business_model TEXT,
  ADD COLUMN IF NOT EXISTS revenue_model TEXT,
  ADD COLUMN IF NOT EXISTS team_size TEXT,
  ADD COLUMN IF NOT EXISTS company_type TEXT,
  ADD COLUMN IF NOT EXISTS churn_rate NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS paying_customers INTEGER,
  ADD COLUMN IF NOT EXISTS pitch_deck_url TEXT,
  ADD COLUMN IF NOT EXISTS product_hunt_url TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url TEXT,
  ADD COLUMN IF NOT EXISTS runway_months INTEGER,
  ADD COLUMN IF NOT EXISTS competitors_json JSONB NOT NULL DEFAULT '[]';

-- ─── Extended Startup Founders ───────────────────────────────────────────────
-- Add twitter_url and bio columns to startup_founders

ALTER TABLE public.startup_founders
  ADD COLUMN IF NOT EXISTS twitter_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT;

-- ─── RLS for investor search (allow reading display_name/firm_name) ──────────
-- Already covered by existing investors_public policy (SELECT USING TRUE)

-- ─── Useful indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS startups_name_trgm_idx
  ON startups USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS investors_display_name_trgm_idx
  ON investors USING gin(coalesce(display_name, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS investors_firm_name_trgm_idx
  ON investors USING gin(coalesce(firm_name, '') gin_trgm_ops);
