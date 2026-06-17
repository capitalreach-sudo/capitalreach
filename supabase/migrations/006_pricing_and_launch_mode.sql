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
