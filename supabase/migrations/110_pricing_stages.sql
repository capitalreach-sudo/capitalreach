-- 110_pricing_stages.sql
-- Pricing becomes a three-stage ladder the owner advances by hand, replacing
-- the launch_mode boolean (which is now simply "stage = founding"):
--
--   founding  -- the first N members pay nothing and keep a founding badge
--   early     -- paywalls bind at roughly half the standard price
--   standard  -- full price
--
-- The stage lives in platform_config so advancing it is a switch in /admin,
-- not a deploy. launch_mode is kept in sync by the same route so every
-- existing reader (investorTier, founderTier, the hero pill) keeps working.

insert into public.platform_config (key, value)
values
  -- The current stage. Everything derives from this one row.
  ('pricing_stage', 'founding'),
  -- The founding cohort's size. 150 by default: with every member now getting
  -- a real verification pass, this is a human-review capacity number, and it
  -- is editable in /admin so it never needs a code change.
  ('founding_target', '150')
on conflict (key) do nothing;

-- Which stage an account joined in. Founding members keep founding pricing
-- for as long as they stay subscribed (Stripe holds the price on the
-- subscription; this column is what lets the UI SAY so), and the badge on
-- their profile is earned, not bought.
alter table public.profiles
  add column if not exists signup_stage text
    check (signup_stage in ('founding','early','standard'));

-- Backfill: everyone who is already here joined during the founding stage.
update public.profiles set signup_stage = 'founding' where signup_stage is null;

comment on column public.profiles.signup_stage is
  'Pricing stage this account joined in. Founding members keep founding terms.';
