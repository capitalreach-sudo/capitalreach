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
