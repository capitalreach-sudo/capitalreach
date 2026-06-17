-- ============================================================
-- VaultRise — Complete Database Setup (all migrations combined)
-- Paste this entire file into Supabase SQL Editor and run it.
-- Safe to run on a fresh project; uses IF NOT EXISTS / OR REPLACE.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 001: Extensions & Core Tables
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── PROFILES ────────────────────────────────────────────────
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

-- ─── STARTUPS ────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS startups_search_idx ON startups USING gin(
  to_tsvector('english', coalesce(name,'') || ' ' || coalesce(tagline,'') || ' ' || coalesce(industry,''))
);
CREATE INDEX IF NOT EXISTS startups_status_idx ON startups(status);
CREATE INDEX IF NOT EXISTS startups_stage_idx ON startups(stage);
CREATE INDEX IF NOT EXISTS startups_industry_idx ON startups(industry);

-- ─── STARTUP FOUNDERS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS startup_founders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  linkedin_url TEXT,
  photo_url TEXT
);

-- ─── STARTUP MILESTONES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS startup_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL
);

-- ─── STARTUP DOCUMENTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS startup_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('pitch_deck','financial_model','cap_table','other')),
  file_url TEXT NOT NULL,
  label TEXT NOT NULL,
  requires_nda BOOLEAN NOT NULL DEFAULT FALSE
);

-- ─── INVESTORS ───────────────────────────────────────────────
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

-- ─── WATCHLISTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(investor_id, startup_id)
);

-- ─── THREADS & MESSAGES ──────────────────────────────────────
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

-- ─── DEALS ───────────────────────────────────────────────────
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

-- ─── NDA RECORDS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nda_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  docusign_envelope_id TEXT,
  signed_at TIMESTAMPTZ,
  UNIQUE(startup_id, investor_id)
);

-- ─── AI REPORTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  investor_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('due_diligence','startup_score','pitch_feedback','match')),
  content TEXT NOT NULL,
  stripe_charge_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PAGEVIEWS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pageviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  investor_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pageviews_startup_idx ON pageviews(startup_id, created_at);

-- ─── EMAIL LOGS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ADMIN ACTIONS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES profiles(id),
  target_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('startup','investor','profile')),
  action TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS startups_updated_at ON startups;
CREATE TRIGGER startups_updated_at BEFORE UPDATE ON startups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS threads_updated_at ON threads;
CREATE TRIGGER threads_updated_at BEFORE UPDATE ON threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS deals_updated_at ON deals;
CREATE TRIGGER deals_updated_at BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 002: Helper Functions
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_pageview(startup_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE startups SET pageviews = pageviews + 1 WHERE id = startup_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_pageview(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_pageview(UUID) TO anon;

CREATE OR REPLACE FUNCTION get_trending_startups(limit_count INTEGER DEFAULT 6)
RETURNS TABLE(
  id UUID, slug TEXT, name TEXT, tagline TEXT, industry TEXT, stage TEXT, recent_views BIGINT
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


-- ─────────────────────────────────────────────────────────────
-- 003: Auth Trigger & Row Level Security
-- ─────────────────────────────────────────────────────────────

-- Auto-create profile row on new signup (email/password + OAuth)
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
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── RLS: Profiles ────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_own" ON profiles;
DROP POLICY IF EXISTS "profiles_public_read" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "profiles_public_read" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_own_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ── RLS: Startups ─────────────────────────────────────────────
ALTER TABLE public.startups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "startups_owner" ON startups;
DROP POLICY IF EXISTS "startups_public_active" ON startups;
DROP POLICY IF EXISTS "startups_admin" ON startups;
DROP POLICY IF EXISTS "Active startups visible to all" ON startups;
DROP POLICY IF EXISTS "Owners can view their own startup" ON startups;
DROP POLICY IF EXISTS "Owners can insert their startup" ON startups;
DROP POLICY IF EXISTS "Owners can update their startup" ON startups;

CREATE POLICY "startups_public_active" ON startups FOR SELECT USING (status = 'active');
CREATE POLICY "startups_owner_select" ON startups FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "startups_owner_insert" ON startups FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "startups_owner_update" ON startups FOR UPDATE USING (auth.uid() = owner_id);

-- ── RLS: Startup sub-tables ───────────────────────────────────
ALTER TABLE public.startup_founders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "founders_owner" ON startup_founders;
DROP POLICY IF EXISTS "founders_public" ON startup_founders;
CREATE POLICY "founders_owner" ON startup_founders FOR ALL USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
);
CREATE POLICY "founders_public" ON startup_founders FOR SELECT USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND status = 'active')
);

ALTER TABLE public.startup_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "milestones_owner" ON startup_milestones;
DROP POLICY IF EXISTS "milestones_public" ON startup_milestones;
CREATE POLICY "milestones_owner" ON startup_milestones FOR ALL USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
);
CREATE POLICY "milestones_public" ON startup_milestones FOR SELECT USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND status = 'active')
);

ALTER TABLE public.startup_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "documents_owner" ON startup_documents;
DROP POLICY IF EXISTS "documents_public" ON startup_documents;
CREATE POLICY "documents_owner" ON startup_documents FOR ALL USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
);
CREATE POLICY "documents_public" ON startup_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND status = 'active')
);

-- ── RLS: Investors ────────────────────────────────────────────
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "investors_owner" ON investors;
DROP POLICY IF EXISTS "investors_public" ON investors;
DROP POLICY IF EXISTS "Investors visible to authenticated users" ON investors;
DROP POLICY IF EXISTS "Owners can insert investor profile" ON investors;
DROP POLICY IF EXISTS "Owners can update investor profile" ON investors;

CREATE POLICY "investors_public" ON investors FOR SELECT USING (true);
CREATE POLICY "investors_owner_insert" ON investors FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "investors_owner_update" ON investors FOR UPDATE USING (auth.uid() = owner_id);

-- ── RLS: Watchlists ───────────────────────────────────────────
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "watchlists_own" ON watchlists;
CREATE POLICY "watchlists_own" ON watchlists FOR ALL USING (
  EXISTS (SELECT 1 FROM investors WHERE id = investor_id AND owner_id = auth.uid())
);

-- ── RLS: Threads ──────────────────────────────────────────────
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "threads_participant" ON threads;
DROP POLICY IF EXISTS "Participants can view threads" ON threads;
DROP POLICY IF EXISTS "Anyone can create a thread" ON threads;
CREATE POLICY "threads_participant_select" ON threads FOR SELECT USING (
  startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
  OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
);
CREATE POLICY "threads_participant_insert" ON threads FOR INSERT WITH CHECK (
  startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
  OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
);
CREATE POLICY "threads_participant_update" ON threads FOR UPDATE USING (
  startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
  OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
);

-- ── RLS: Messages ─────────────────────────────────────────────
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_participant" ON messages;
DROP POLICY IF EXISTS "Thread participants can read messages" ON messages;
DROP POLICY IF EXISTS "Thread participants can insert messages" ON messages;
CREATE POLICY "messages_participant_select" ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM threads t
    WHERE t.id = thread_id
    AND (
      t.startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
      OR t.investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
    )
  )
);
CREATE POLICY "messages_participant_insert" ON messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
);

-- ── RLS: Other tables ─────────────────────────────────────────
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deals_participant" ON deals;
DROP POLICY IF EXISTS "deals_admin" ON deals;
CREATE POLICY "deals_participant" ON deals FOR ALL USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM investors WHERE id = investor_id AND owner_id = auth.uid())
);

ALTER TABLE public.nda_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nda_participant" ON nda_records;
CREATE POLICY "nda_participant" ON nda_records FOR ALL USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM investors WHERE id = investor_id AND owner_id = auth.uid())
);

ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_reports_own" ON ai_reports;
CREATE POLICY "ai_reports_own" ON ai_reports FOR ALL USING (
  EXISTS (SELECT 1 FROM investors WHERE id = investor_id AND owner_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM startups s WHERE s.id = startup_id AND s.owner_id = auth.uid()
  )
);

ALTER TABLE public.pageviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pageviews_insert" ON pageviews;
DROP POLICY IF EXISTS "pageviews_owner" ON pageviews;
CREATE POLICY "pageviews_insert" ON pageviews FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "pageviews_owner" ON pageviews FOR SELECT USING (
  EXISTS (SELECT 1 FROM startups WHERE id = startup_id AND owner_id = auth.uid())
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_logs_own" ON email_logs;
CREATE POLICY "email_logs_own" ON email_logs FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_actions_admin" ON admin_actions;
CREATE POLICY "admin_actions_admin" ON admin_actions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);


-- ─────────────────────────────────────────────────────────────
-- 004: Extended Fields (investor/startup/founder profiles)
-- ─────────────────────────────────────────────────────────────

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

ALTER TABLE public.startup_founders
  ADD COLUMN IF NOT EXISTS twitter_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT;

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS investors_name_idx
  ON investors USING gin(
    to_tsvector('english',
      coalesce(display_name,'') || ' ' ||
      coalesce(firm_name,'') || ' ' ||
      coalesce(bio,'')
    )
  );

CREATE INDEX IF NOT EXISTS startups_name_trgm_idx
  ON startups USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS investors_display_name_trgm_idx
  ON investors USING gin(coalesce(display_name, '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS investors_firm_name_trgm_idx
  ON investors USING gin(coalesce(firm_name, '') gin_trgm_ops);
