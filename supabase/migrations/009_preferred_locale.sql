-- Migration 009: Add preferred_locale to profiles for persisted language preference
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_locale text DEFAULT 'en'
    CHECK (preferred_locale IN ('en', 'de'));
