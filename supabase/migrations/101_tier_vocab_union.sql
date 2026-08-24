-- 101: the tier CHECKs predate the plan rename (pro_investor→pro,
-- institutional→institution) and would have REJECTED every investor plan
-- grant the checkout now writes. Widened to the union; readers already
-- accept both spellings (lib/ai-limits), writers use the modern ids.
alter table public.investors drop constraint if exists investors_subscription_tier_check;
alter table public.investors add constraint investors_subscription_tier_check
  check (subscription_tier = any (array['free','angel','pro','pro_investor','institution','institutional']::text[]));
