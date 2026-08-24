-- 099: what "verified" actually MEANS, and what a close actually WAS.
--
-- verification_checks: the badge said "identity checked" while recording
-- only a timestamp — which checks were run was folklore. Now the verify
-- action records the list, and the badge popover shows it: a badge that
-- can say what it means is a trust signal; one that can't is decoration.
--
-- closing_snapshot: the deal's terms AT the moment of close, frozen. Deals
-- keep evolving references (names change, listings edit); the snapshot is
-- the record the cap table reads from.
alter table public.startups  add column if not exists verification_checks jsonb;
alter table public.investors add column if not exists verification_checks jsonb;
alter table public.deals     add column if not exists closing_snapshot jsonb;
