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
