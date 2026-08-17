-- listed_at: when a startup went live. Alerts matched on created_at, but a
-- listing is created as draft and flipped active by an admin later — often
-- more than a day later — so most listings could never fire a saved-search
-- alert. Stamped at approval; backfilled from updated_at for already-active
-- rows (best available proxy).
alter table startups add column if not exists listed_at timestamptz;
update startups set listed_at = coalesce(listed_at, updated_at, created_at) where status = 'active' and listed_at is null;
create index if not exists idx_startups_listed_at on startups(listed_at) where status = 'active';
