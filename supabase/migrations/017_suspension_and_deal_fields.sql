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
