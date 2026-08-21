-- 096: investors.video_url — a short intro video on the investor profile
-- (the counterpart of startups.demo_video_url). Paid feature: the UI offers
-- it on Pro/Institution and the profile only renders it for those tiers, so
-- a downgraded account's video disappears rather than lingering.
alter table public.investors add column if not exists video_url text;
