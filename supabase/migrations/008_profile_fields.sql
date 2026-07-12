-- Feature 3: Richer startup and investor profile fields

-- Startup new optional fields
ALTER TABLE startups ADD COLUMN IF NOT EXISTS target_markets   text[];
ALTER TABLE startups ADD COLUMN IF NOT EXISTS languages        text[];
ALTER TABLE startups ADD COLUMN IF NOT EXISTS previous_funding numeric;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS lead_investor    text;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS deck_language    text;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS video_pitch_url  text;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS social_proof     jsonb;
ALTER TABLE startups ADD COLUMN IF NOT EXISTS looking_for      text[];

-- Investor new optional fields (on profiles table)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS investment_thesis    text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS check_size_min       numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS check_size_max       numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_stages     text[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_industries text[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_countries  text[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS investor_type        text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS portfolio_count      integer;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lead_investor        boolean;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS languages            text[];
