-- =====================================================================
-- CapitalReach - full schema bootstrap
--
-- GENERATED FILE - do not edit by hand.
-- Regenerate with:  npm run db:bootstrap
--
-- Paste into the SQL editor of a NEW Supabase project and run once.
-- Every migration is idempotent, so re-running is safe.
--
-- Built from 17 migrations on 2026-07-26:
--   001_initial_schema.sql
--   002_functions.sql
--   003_auth_trigger_and_rls.sql
--   004_extended_fields.sql
--   005_update_tier_constraints.sql
--   006_pricing_and_launch_mode.sql
--   007_performance_indexes.sql
--   008_profile_fields.sql
--   009_preferred_locale.sql
--   011_fix_messaging_realtime.sql
--   012_startup_to_startup_messaging.sql
--   013_deal_currency.sql
--   014_contracts.sql
--   015_deal_activity.sql
--   016_deal_follow_up.sql
--   017_suspension_and_deal_fields.sql
--   018_success_fee_paid.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 001_initial_schema.sql
-- ---------------------------------------------------------------------

-- VaultRise Initial Schema
-- Run via: supabase db push

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy search

-- ─── PROFILES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('startup', 'investor', 'admin')),
  stripe_customer_id TEXT UNIQUE,
  subscription_tier TEXT CHECK (subscription_tier IN ('free','listed','pro','premium','angel','pro_investor','institutional')),
  subscription_status TEXT CHECK (subscription_status IN ('active','past_due','cancelled','trialing','incomplete')),
  accreditation_certified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── STARTUPS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS startups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  website TEXT,
  tagline TEXT NOT NULL,
  description TEXT,
  problem TEXT,
  solution TEXT,
  market TEXT,
  competitive_advantage TEXT,
  stage TEXT NOT NULL CHECK (stage IN ('pre-seed','seed','series_a','series_b_plus')),
  industry TEXT NOT NULL,
  country TEXT NOT NULL,
  funding_target BIGINT NOT NULL DEFAULT 0,
  equity_offered NUMERIC(5,2),
  min_check_size BIGINT,
  use_of_funds TEXT,
  mrr BIGINT,
  arr BIGINT,
  user_count BIGINT,
  growth_rate NUMERIC(6,2),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','active','suspended','archived')),
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free','listed','pro','premium')),
  vaultrise_score INTEGER CHECK (vaultrise_score BETWEEN 0 AND 100),
  pageviews INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  require_nda BOOLEAN NOT NULL DEFAULT FALSE,
  demo_video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full-text search index
CREATE INDEX IF NOT EXISTS startups_search_idx ON startups USING gin(
  to_tsvector('english', coalesce(name,'') || ' ' || coalesce(tagline,'') || ' ' || coalesce(industry,''))
);
CREATE INDEX IF NOT EXISTS startups_status_idx ON startups(status);
CREATE INDEX IF NOT EXISTS startups_stage_idx ON startups(stage);
CREATE INDEX IF NOT EXISTS startups_industry_idx ON startups(industry);

-- ─── STARTUP FOUNDERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS startup_founders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  linkedin_url TEXT,
  photo_url TEXT
);

-- ─── STARTUP MILESTONES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS startup_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL
);

-- ─── STARTUP DOCUMENTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS startup_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('pitch_deck','financial_model','cap_table','other')),
  file_url TEXT NOT NULL,
  label TEXT NOT NULL,
  requires_nda BOOLEAN NOT NULL DEFAULT FALSE
);

-- ─── INVESTORS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS investors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('angel','vc','family_office','corporate')),
  bio TEXT,
  linkedin_url TEXT,
  industries TEXT[] NOT NULL DEFAULT '{}',
  stages TEXT[] NOT NULL DEFAULT '{}',
  min_check BIGINT,
  max_check BIGINT,
  geography TEXT[] NOT NULL DEFAULT '{}',
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free','angel','pro_investor','institutional')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── WATCHLISTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(investor_id, startup_id)
);

-- ─── THREADS & MESSAGES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','due_diligence','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(startup_id, investor_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(thread_id, created_at);

-- ─── DEALS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  amount BIGINT,
  status TEXT NOT NULL DEFAULT 'intro' CHECK (status IN ('intro','due_diligence','term_sheet','closed','passed')),
  success_fee_invoiced BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_invoice_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── NDA RECORDS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nda_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  docusign_envelope_id TEXT,
  signed_at TIMESTAMPTZ,
  UNIQUE(startup_id, investor_id)
);

-- ─── AI REPORTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  investor_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('due_diligence','startup_score','pitch_feedback','match')),
  content TEXT NOT NULL,
  stripe_charge_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PAGEVIEWS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pageviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  investor_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pageviews_startup_idx ON pageviews(startup_id, created_at);

-- ─── EMAIL LOGS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ADMIN ACTIONS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES profiles(id),
  target_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('startup','investor','profile')),
  action TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER startups_updated_at BEFORE UPDATE ON startups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER threads_updated_at BEFORE UPDATE ON threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER deals_updated_at BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE startups ENABLE ROW LEVEL SECURITY;
ALTER TABLE startup_founders ENABLE ROW LEVEL SECURITY;
ALTER TABLE startup_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE startup_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE nda_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pageviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "profiles_own" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "profiles_public_read" ON profiles FOR SELECT USING (TRUE);

-- Startups: owners manage, public reads active ones
CREATE POLICY "startups_owner" ON startups FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "startups_public_active" ON startups FOR SELECT USING (status = 'active');
CREATE POLICY "startups_admin" ON startups FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Startup sub-tables: owner manages, public reads for active startups
CREATE POLICY "founders_owner" ON startup_founders FOR ALL USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
);
CREATE POLICY "founders_public" ON startup_founders FOR SELECT USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND status = 'active')
);

CREATE POLICY "milestones_owner" ON startup_milestones FOR ALL USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
);
CREATE POLICY "milestones_public" ON startup_milestones FOR SELECT USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND status = 'active')
);

CREATE POLICY "documents_owner" ON startup_documents FOR ALL USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
);
-- Documents visibility handled at application layer (NDA + tier checks)
CREATE POLICY "documents_public" ON startup_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND status = 'active')
);

-- Investors: owner manages, public reads
CREATE POLICY "investors_owner" ON investors FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "investors_public" ON investors FOR SELECT USING (TRUE);

-- Watchlists: investors manage their own
CREATE POLICY "watchlists_own" ON watchlists FOR ALL USING (
  EXISTS (SELECT 1 FROM investors WHERE id = investor_id AND owner_id = auth.uid())
);

-- Threads: startup owner or investor owner can read/write
CREATE POLICY "threads_participant" ON threads FOR ALL USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM investors WHERE id = investor_id AND owner_id = auth.uid())
);

-- Messages: thread participants only
CREATE POLICY "messages_participant" ON messages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM threads t
    WHERE t.id = thread_id
    AND (
      EXISTS (SELECT 1 FROM startups WHERE id = t.startup_id AND owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM investors WHERE id = t.investor_id AND owner_id = auth.uid())
    )
  )
);

-- Deals: participants only
CREATE POLICY "deals_participant" ON deals FOR ALL USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM investors WHERE id = investor_id AND owner_id = auth.uid())
);
CREATE POLICY "deals_admin" ON deals FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- NDA: participants only
CREATE POLICY "nda_participant" ON nda_records FOR ALL USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM investors WHERE id = investor_id AND owner_id = auth.uid())
);

-- AI reports: owner
CREATE POLICY "ai_reports_own" ON ai_reports FOR ALL USING (
  EXISTS (SELECT 1 FROM investors WHERE id = investor_id AND owner_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM startups s
    JOIN profiles p ON p.id = s.owner_id
    WHERE s.id = startup_id AND p.id = auth.uid()
  )
);

-- Pageviews: insert by authenticated users, read by startup owner
CREATE POLICY "pageviews_insert" ON pageviews FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "pageviews_owner" ON pageviews FOR SELECT USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
);

-- Admin policies (service role bypasses RLS)
CREATE POLICY "admin_actions_admin" ON admin_actions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "email_logs_own" ON email_logs FOR SELECT USING (auth.uid() = user_id);

-- ─── STORAGE BUCKETS ─────────────────────────────────────────────────────────
-- Run in Supabase Dashboard or via CLI:
-- supabase storage create startup-assets --public false
-- supabase storage create avatars --public true


-- ---------------------------------------------------------------------
-- 002_functions.sql
-- ---------------------------------------------------------------------

-- Helper function: increment startup pageview counter atomically
CREATE OR REPLACE FUNCTION increment_pageview(startup_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE startups SET pageviews = pageviews + 1 WHERE id = startup_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION increment_pageview(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_pageview(UUID) TO anon;

-- Helper: get trending startups (most pageviews in last 7 days)
CREATE OR REPLACE FUNCTION get_trending_startups(limit_count INTEGER DEFAULT 6)
RETURNS TABLE(
  id UUID,
  slug TEXT,
  name TEXT,
  tagline TEXT,
  industry TEXT,
  stage TEXT,
  recent_views BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.slug, s.name, s.tagline, s.industry, s.stage,
    COUNT(pv.id) AS recent_views
  FROM startups s
  LEFT JOIN pageviews pv ON pv.startup_id = s.id
    AND pv.created_at >= NOW() - INTERVAL '7 days'
  WHERE s.status = 'active'
  GROUP BY s.id
  ORDER BY recent_views DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_trending_startups(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_trending_startups(INTEGER) TO anon;

-- Helper: get daily view counts for a startup (last 30 days)
CREATE OR REPLACE FUNCTION get_startup_daily_views(p_startup_id UUID)
RETURNS TABLE(date DATE, views BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(created_at) AS date,
    COUNT(*) AS views
  FROM pageviews
  WHERE startup_id = p_startup_id
    AND created_at >= NOW() - INTERVAL '30 days'
  GROUP BY DATE(created_at)
  ORDER BY date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_startup_daily_views(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- 003_auth_trigger_and_rls.sql
-- ---------------------------------------------------------------------

-- ─── Auto-create profile on every new signup ─────────────────────────────────
-- Fires after INSERT on auth.users so a profile row exists immediately,
-- whether the user signed up with email/password OR Google OAuth.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, subscription_tier)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name'
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_user_meta_data->>'role', 'investor'),
    'free'
  )
  ON CONFLICT (id) DO NOTHING; -- idempotent
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop first so this file can be re-run safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Row Level Security for profiles ─────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read all profiles (needed for search, investor cards, etc.)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- Users can only update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- The trigger runs as SECURITY DEFINER so it bypasses RLS on INSERT.
-- Authenticated users should NOT be able to insert arbitrary profiles.
-- (Only the trigger and service-role key may do so.)

-- ─── Row Level Security for startups ─────────────────────────────────────────

ALTER TABLE public.startups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active startups visible to all" ON startups;
CREATE POLICY "Active startups visible to all"
  ON startups FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS "Owners can view their own startup" ON startups;
CREATE POLICY "Owners can view their own startup"
  ON startups FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert their startup" ON startups;
CREATE POLICY "Owners can insert their startup"
  ON startups FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update their startup" ON startups;
CREATE POLICY "Owners can update their startup"
  ON startups FOR UPDATE
  USING (auth.uid() = owner_id);

-- ─── Row Level Security for investors ────────────────────────────────────────

ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Investors visible to authenticated users" ON investors;
CREATE POLICY "Investors visible to authenticated users"
  ON investors FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Owners can insert investor profile" ON investors;
CREATE POLICY "Owners can insert investor profile"
  ON investors FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update investor profile" ON investors;
CREATE POLICY "Owners can update investor profile"
  ON investors FOR UPDATE
  USING (auth.uid() = owner_id);

-- ─── Row Level Security for messages ─────────────────────────────────────────

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Thread participants can read messages" ON messages;
CREATE POLICY "Thread participants can read messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM threads t
      WHERE t.id = thread_id
        AND (t.startup_id IN (
              SELECT id FROM startups WHERE owner_id = auth.uid()
            )
            OR t.investor_id IN (
              SELECT id FROM investors WHERE owner_id = auth.uid()
            ))
    )
  );

DROP POLICY IF EXISTS "Thread participants can insert messages" ON messages;
CREATE POLICY "Thread participants can insert messages"
  ON messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- ─── Row Level Security for threads ──────────────────────────────────────────

ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view threads" ON threads;
CREATE POLICY "Participants can view threads"
  ON threads FOR SELECT
  USING (
    startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
    OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Anyone can create a thread" ON threads;
CREATE POLICY "Anyone can create a thread"
  ON threads FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Participants can update threads" ON threads;
CREATE POLICY "Participants can update threads"
  ON threads FOR UPDATE
  USING (
    startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
    OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
  );


-- ---------------------------------------------------------------------
-- 004_extended_fields.sql
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- 005_update_tier_constraints.sql
-- ---------------------------------------------------------------------

-- ─── Update Subscription Tier CHECK Constraints ──────────────────────────────
-- Replaces old tier names (listed/pro/premium) with new names (starter/growth).
-- Must run AFTER 001_initial_schema.sql.

-- profiles.subscription_tier: add starter/growth, remove listed/pro/premium
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_tier_check
  CHECK (subscription_tier IN ('free','starter','growth','angel','pro_investor','institutional'));

-- startups.subscription_tier: add starter/growth, remove listed/pro/premium
ALTER TABLE public.startups
  DROP CONSTRAINT IF EXISTS startups_subscription_tier_check;
ALTER TABLE public.startups
  ADD CONSTRAINT startups_subscription_tier_check
  CHECK (subscription_tier IN ('free','starter','growth'));

-- Migrate any rows still using old tier names (safe to run multiple times)
UPDATE public.profiles SET subscription_tier = 'starter' WHERE subscription_tier = 'listed';
UPDATE public.profiles SET subscription_tier = 'growth'  WHERE subscription_tier = 'pro';
UPDATE public.profiles SET subscription_tier = 'growth'  WHERE subscription_tier = 'premium';

UPDATE public.startups SET subscription_tier = 'starter' WHERE subscription_tier = 'listed';
UPDATE public.startups SET subscription_tier = 'growth'  WHERE subscription_tier = 'pro';
UPDATE public.startups SET subscription_tier = 'growth'  WHERE subscription_tier = 'premium';


-- ---------------------------------------------------------------------
-- 006_pricing_and_launch_mode.sql
-- ---------------------------------------------------------------------

-- Migration 006: Pricing v2 — platform_config table + stripe_subscription_id

-- ── platform_config ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed: launch mode on, member counter at 0
INSERT INTO platform_config (key, value) VALUES
  ('launch_mode',   'true'),
  ('member_count',  '0')
ON CONFLICT (key) DO NOTHING;

-- ── profiles: add stripe_subscription_id ──────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- ── RLS for platform_config (read-only for all authenticated users) ────────────
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_config_read"
  ON platform_config FOR SELECT
  USING (true);

-- Only service-role can write (no authenticated insert/update policy)


-- ---------------------------------------------------------------------
-- 007_performance_indexes.sql
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- 008_profile_fields.sql
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- 009_preferred_locale.sql
-- ---------------------------------------------------------------------

-- Migration 009: Add preferred_locale to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_locale text DEFAULT 'en';

-- Drop any old narrow check constraint (en/de only) if it exists
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_locale_check;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS profiles_preferred_locale_idx
  ON profiles(preferred_locale);

-- Comment
COMMENT ON COLUMN profiles.preferred_locale IS
  'User preferred UI language. Overrides cookie on login.';


-- ---------------------------------------------------------------------
-- 011_fix_messaging_realtime.sql
-- ---------------------------------------------------------------------

-- Fix messaging: ensure threads/messages RLS is correct (idempotent, safe to
-- re-run regardless of whether migration 003 or 000_combined ran previously),
-- and add both tables to the realtime publication so postgres_changes
-- subscriptions in the dashboard inbox actually receive INSERT events.

ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view threads" ON threads;
CREATE POLICY "Participants can view threads"
  ON threads FOR SELECT
  USING (
    startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
    OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Anyone can create a thread" ON threads;
CREATE POLICY "Anyone can create a thread"
  ON threads FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Participants can update threads" ON threads;
CREATE POLICY "Participants can update threads"
  ON threads FOR UPDATE
  USING (
    startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
    OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
  );

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Thread participants can read messages" ON messages;
CREATE POLICY "Thread participants can read messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM threads t
      WHERE t.id = thread_id
        AND (t.startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
             OR t.investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Thread participants can insert messages" ON messages;
CREATE POLICY "Thread participants can insert messages"
  ON messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Add threads/messages to the realtime publication (idempotent — skips if
-- already present, since ALTER PUBLICATION ... ADD TABLE errors otherwise).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE threads;
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- 012_startup_to_startup_messaging.sql
-- ---------------------------------------------------------------------

-- Add startup-to-startup messaging. Threads were previously always
-- (startup_id, investor_id). This adds an optional recipient_startup_id so a
-- thread can instead be (startup_id = initiator, recipient_startup_id =
-- target), with investor_id left null in that case.

ALTER TABLE threads ALTER COLUMN investor_id DROP NOT NULL;

ALTER TABLE threads ADD COLUMN IF NOT EXISTS recipient_startup_id UUID REFERENCES startups(id) ON DELETE CASCADE;

ALTER TABLE threads DROP CONSTRAINT IF EXISTS threads_exactly_one_recipient;
ALTER TABLE threads ADD CONSTRAINT threads_exactly_one_recipient CHECK (
  (investor_id IS NOT NULL AND recipient_startup_id IS NULL)
  OR (investor_id IS NULL AND recipient_startup_id IS NOT NULL)
);

ALTER TABLE threads DROP CONSTRAINT IF EXISTS threads_no_self_message;
ALTER TABLE threads ADD CONSTRAINT threads_no_self_message CHECK (
  startup_id IS DISTINCT FROM recipient_startup_id
);

-- Existing UNIQUE(startup_id, investor_id) already prevents duplicate
-- investor threads (investor_id NULL doesn't collide, since NULL <> NULL in
-- a unique index). Add the equivalent guard for startup-pair threads.
CREATE UNIQUE INDEX IF NOT EXISTS threads_startup_pair_unique
  ON threads (LEAST(startup_id, recipient_startup_id), GREATEST(startup_id, recipient_startup_id))
  WHERE recipient_startup_id IS NOT NULL;

-- Refresh RLS on threads/messages to also recognize the recipient startup as
-- a participant (idempotent — safe to re-run alongside migration 011).
DROP POLICY IF EXISTS "Participants can view threads" ON threads;
CREATE POLICY "Participants can view threads"
  ON threads FOR SELECT
  USING (
    startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
    OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
    OR recipient_startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Anyone can create a thread" ON threads;
CREATE POLICY "Anyone can create a thread"
  ON threads FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Participants can update threads" ON threads;
CREATE POLICY "Participants can update threads"
  ON threads FOR UPDATE
  USING (
    startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
    OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
    OR recipient_startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Thread participants can read messages" ON messages;
CREATE POLICY "Thread participants can read messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM threads t
      WHERE t.id = thread_id
        AND (t.startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
             OR t.investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
             OR t.recipient_startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid()))
    )
  );


-- ---------------------------------------------------------------------
-- 013_deal_currency.sql
-- ---------------------------------------------------------------------

-- ─── DEAL CURRENCY ───────────────────────────────────────────────────────────
-- Adds a currency to each deal so amounts can be recorded and displayed in the
-- currency the round actually closed in, not just USD. Existing rows default to
-- USD to preserve current behaviour. Idempotent.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

-- Restrict to the set of currencies the app offers (see lib/currency.ts).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_currency_check'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_currency_check
      CHECK (currency IN ('USD','EUR','GBP','CHF','CAD','AUD','JPY','SGD','INR','AED'));
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- 014_contracts.sql
-- ---------------------------------------------------------------------

-- ─── CONTRACTS ───────────────────────────────────────────────────────────────
-- Contracts (term sheets, SAFEs, notes, NDAs, custom agreements) drafted
-- against a deal in the Deal Portal. Both deal participants can view and
-- manage them. Idempotent.

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  contract_type TEXT NOT NULL DEFAULT 'term_sheet'
    CHECK (contract_type IN ('term_sheet','safe','convertible_note','nda','custom')),
  amount BIGINT,
  currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (currency IN ('USD','EUR','GBP','CHF','CAD','AUD','JPY','SGD','INR','AED')),
  equity_percent NUMERIC(5,2),
  terms TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','signed','void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contracts_deal_idx     ON contracts(deal_id);
CREATE INDEX IF NOT EXISTS contracts_startup_idx  ON contracts(startup_id);
CREATE INDEX IF NOT EXISTS contracts_investor_idx ON contracts(investor_id);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_participants" ON contracts;
CREATE POLICY "contracts_participants" ON contracts FOR ALL USING (
  EXISTS (SELECT 1 FROM startups s  WHERE s.id = contracts.startup_id  AND s.owner_id = auth.uid())
  OR
  EXISTS (SELECT 1 FROM investors i WHERE i.id = contracts.investor_id AND i.owner_id = auth.uid())
);

DROP TRIGGER IF EXISTS contracts_updated_at ON contracts;
CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ---------------------------------------------------------------------
-- 015_deal_activity.sql
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- 016_deal_follow_up.sql
-- ---------------------------------------------------------------------

-- ─── DEAL FOLLOW-UP DATE ─────────────────────────────────────────────────────
-- Optional reminder date so deal owners can flag when to next check in on a
-- deal. Purely advisory — no automated notification is sent. Idempotent.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS next_follow_up DATE;


-- ---------------------------------------------------------------------
-- 017_suspension_and_deal_fields.sql
-- ---------------------------------------------------------------------

-- --- USER SUSPENSION, DEAL FIELDS, VIEW TRACKING, CONSENT --------------------
-- Corrected against the live schema:
--   * roles are 'startup' | 'investor' | 'admin'  (there is no 'founder')
--   * startups.owner_id  (not founder_id)
--   * deals.investor_id  -> investors(id), NOT profiles(id)
--   * deals uses status/amount (not stage/closed_amount)
--   * deals, deal_activity and admin_actions already exist -- extend, don't recreate
-- Idempotent.

-- -- 1. USER SUSPENSION (profiles) --------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS suspended        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspended_until  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_status   TEXT NOT NULL DEFAULT 'active';

-- Added separately so re-running cannot fail on a duplicate constraint.
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_account_status_check
    CHECK (account_status IN ('active','suspended','banned','pending'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -- 2. LEGAL CONSENT (profiles) ----------------------------------------------
-- The Terms say use "constitutes acceptance", which is weak. Record explicit
-- consent at signup, and the investor declarations the Terms claim we collect.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS investor_declarations JSONB;

-- -- 3. DEAL FIELDS the Deal Portal needs but the table never had -------------
-- Existing columns kept as-is: status, amount, currency, next_follow_up,
-- success_fee_invoiced, stripe_invoice_id.
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS notes              TEXT,
  ADD COLUMN IF NOT EXISTS term_sheet_url     TEXT,
  ADD COLUMN IF NOT EXISTS closed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS passed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS success_fee_amount BIGINT;

-- -- 4. STARTUP VIEW TRACKING -------------------------------------------------
-- Terms §3 defines a "CapitalReach connection" as the investor finding the
-- startup here. Nothing recorded that, so the fee was unprovable. This does.
CREATE TABLE IF NOT EXISTS startup_views (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id  UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per pair per day. Must be a unique INDEX -- an expression is not
-- valid inside a UNIQUE table constraint.
--
-- The timezone is pinned to UTC deliberately: a bare viewed_at::date depends
-- on the session TimeZone, which makes it STABLE rather than IMMUTABLE, and
-- Postgres rejects it in an index expression (42P17).
CREATE UNIQUE INDEX IF NOT EXISTS startup_views_daily_idx
  ON startup_views (startup_id, investor_id, ((viewed_at AT TIME ZONE 'UTC')::date));

ALTER TABLE startup_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "startup_views_participants" ON startup_views;
CREATE POLICY "startup_views_participants" ON startup_views FOR SELECT USING (
  EXISTS (SELECT 1 FROM startups  s WHERE s.id = startup_views.startup_id  AND s.owner_id = auth.uid())
  OR
  EXISTS (SELECT 1 FROM investors i WHERE i.id = startup_views.investor_id AND i.owner_id = auth.uid())
);

-- -- 5. BLOCK SUSPENDED USERS FROM WRITING ------------------------------------
-- Read access is left intact so a suspended user can still see /suspended and
-- their own account. These stop them acting.

CREATE OR REPLACE FUNCTION is_suspended() RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT suspended OR account_status IN ('suspended','banned')
     FROM profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- These MUST be RESTRICTIVE. Postgres combines permissive policies with OR, so
-- a plain policy here would sit alongside the existing participant/admin
-- policies and passing either one would be enough -- the block would silently
-- do nothing. Restrictive policies are AND-ed with the rest, so this denies
-- regardless of what else permits.
DROP POLICY IF EXISTS "deals_not_suspended_insert" ON deals;
CREATE POLICY "deals_not_suspended_insert" ON deals AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT is_suspended());

DROP POLICY IF EXISTS "messages_not_suspended_insert" ON messages;
CREATE POLICY "messages_not_suspended_insert" ON messages AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT is_suspended());

DROP POLICY IF EXISTS "contracts_not_suspended_insert" ON contracts;
CREATE POLICY "contracts_not_suspended_insert" ON contracts AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT is_suspended());

-- -- 6. ADMIN AUDIT LOG -------------------------------------------------------
-- admin_actions already exists (migration 001) with admin_id/target_id/
-- target_type/action/note. Only the pieces it lacks are added here.
ALTER TABLE admin_actions
  ADD COLUMN IF NOT EXISTS details JSONB;

-- target_type was CHECK-constrained to startup|investor|profile; suspension
-- work needs 'platform' for bulk actions that target no single row.
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check
  CHECK (target_type IN ('startup','investor','profile','platform'));

-- Bulk actions have no single target, so target_id must be nullable.
ALTER TABLE admin_actions ALTER COLUMN target_id DROP NOT NULL;

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_actions_admin_read" ON admin_actions;
CREATE POLICY "admin_actions_admin_read" ON admin_actions FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- -- 7. INDEXES ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS profiles_suspended_idx      ON profiles(suspended) WHERE suspended = TRUE;
CREATE INDEX IF NOT EXISTS profiles_account_status_idx ON profiles(account_status);
CREATE INDEX IF NOT EXISTS admin_actions_created_idx   ON admin_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS startup_views_startup_idx   ON startup_views(startup_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS deals_status_idx            ON deals(status);


-- ---------------------------------------------------------------------
-- 018_success_fee_paid.sql
-- ---------------------------------------------------------------------

-- 018: record when a 2% success-fee invoice is actually paid.
--
-- deals already tracks success_fee_invoiced (did we raise the invoice?) but
-- nothing tracked collection. The Stripe webhook now distinguishes success-fee
-- invoices from subscription invoices and stamps this column on invoice.paid,
-- so unpaid fees are visible instead of silently indistinguishable from paid.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS success_fee_paid_at TIMESTAMPTZ;

-- The webhook looks up the deal by the Stripe invoice id, so that lookup needs
-- to be indexed. Partial: the vast majority of deals never get an invoice.
CREATE INDEX IF NOT EXISTS idx_deals_stripe_invoice_id
  ON deals (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

