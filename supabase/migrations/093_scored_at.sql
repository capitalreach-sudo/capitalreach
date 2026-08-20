-- 093 — scores learn to age.
--
-- vaultrise_score was computed once, at approval, and never again. A founder
-- who tripled their MRR kept the score of the company they used to be; a
-- founder whose numbers collapsed kept the flattering one. Both directions
-- mislead the investors the score exists to serve.
--
-- scored_at records when the model last looked. The daily cron re-scores
-- listings whose content moved after that (updated_at > scored_at), a few per
-- run, oldest drift first.
alter table startups add column if not exists scored_at timestamptz;
-- Backfill: whatever has a score today was scored at some point before now.
update startups set scored_at = coalesce(updated_at, now())
where vaultrise_score is not null and scored_at is null;
