-- 132 - A fresh save has, by definition, seen everything up to the save.
--
-- watchlists.changes_seen_at had no default and the save route never set it,
-- so every row since migration 088's one-time backfill carried NULL -- which
-- /api/watchlist/changes reads as epoch. The moment an investor saved a
-- company, its ENTIRE history flooded "what changed since you last looked":
-- exactly the failure 088's comment says the backfill exists to prevent, back
-- for every new row. The route now stamps the insert; the default catches any
-- other writer, and the re-backfill repairs the rows created in between.
alter table public.watchlists
  alter column changes_seen_at set default now();

update public.watchlists
  set changes_seen_at = created_at
  where changes_seen_at is null;
