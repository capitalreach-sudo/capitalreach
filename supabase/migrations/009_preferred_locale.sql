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
