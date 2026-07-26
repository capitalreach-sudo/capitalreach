-- 019: stop serving the entire user table to anonymous visitors, and give the
-- public investor profile a source of truth that isn't `profiles`.
--
-- The bug: 001 created
--     CREATE POLICY "profiles_public_read" ON profiles FOR SELECT USING (TRUE);
-- With no TO clause that applies to the `anon` role as well, so anyone holding
-- the publishable key -- which ships in the browser bundle on every page load
-- -- could read every row and every column of `profiles`: email addresses,
-- full names, subscription_tier, and (once populated in production)
-- stripe_customer_id and suspended_reason. Verified anonymously against
-- staging: 21/21 rows returned with emails.
--
-- We cannot simply scope the policy to authenticated, because the PUBLIC
-- investor profile page joins owner:profiles(...) for the investor's thesis,
-- check sizes, and so on. That data was being read out of `profiles` even
-- though `investors` already carries all of it under different column names
-- (min_check/check_size_min, stages/preferred_stages, type/investor_type,
-- number_of_investments/portfolio_count, lead_rounds/lead_investor). Only two
-- fields were genuinely missing, so we add those, backfill, and point the page
-- at `investors` -- which is meant to be public and stays public.

-- ── 1. The two fields the public profile needs and `investors` lacked ────────
ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS languages  TEXT[],
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── 2. Backfill from profiles, without clobbering anything already set ───────
-- COALESCE keeps the investors value whenever it has one; profiles only fills
-- the gaps. Safe to re-run.
UPDATE investors i SET
  languages             = COALESCE(i.languages,             p.languages),
  avatar_url            = COALESCE(i.avatar_url,            p.avatar_url),
  investment_thesis     = COALESCE(i.investment_thesis,     p.investment_thesis),
  min_check             = COALESCE(i.min_check,             p.check_size_min),
  max_check             = COALESCE(i.max_check,             p.check_size_max),
  stages                = COALESCE(i.stages,                p.preferred_stages),
  industries            = COALESCE(i.industries,            p.preferred_industries),
  geography             = COALESCE(i.geography,             p.preferred_countries),
  number_of_investments = COALESCE(i.number_of_investments, p.portfolio_count),
  lead_rounds           = COALESCE(i.lead_rounds,           p.lead_investor),
  type                  = COALESCE(i.type,                  p.investor_type)
FROM profiles p
WHERE p.id = i.owner_id;

-- ── 3. Close the hole ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_public_read" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;

-- Authenticated users keep broad read access: the message composer searches
-- other users by name, /admin lists them, and several routes resolve a
-- counterparty. Narrowing that further means introducing a restricted view and
-- reworking those call sites -- worth doing, but it is a design change, not a
-- hotfix, and it is tracked separately. What this migration guarantees is that
-- a visitor with no session gets nothing.
CREATE POLICY "profiles_read_authenticated"
  ON profiles FOR SELECT
  TO authenticated
  USING (TRUE);

-- profiles_own from 001 (FOR ALL USING auth.uid() = id) still covers writes.
