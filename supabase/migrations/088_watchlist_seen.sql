-- 088 — "what changed on the companies I am watching".
--
-- An investor saves a company and then never hears about it again. Everything
-- that would make a follow-up worth sending is already recorded — the founder
-- posts updates, uploads documents, moves the round state, files new metrics —
-- but each lives on the listing page, and nobody reloads twenty listing pages
-- to find out whether one of them moved.
--
-- One column is all this needs: when the investor last looked. Everything else
-- is a query against timestamps that already exist.
alter table watchlists
  add column if not exists changes_seen_at timestamptz;

-- Backfilled to the moment the company was saved rather than left null: a null
-- would make every change since the beginning of time "new", and an investor
-- whose first visit shows forty updates learns to ignore the panel.
update watchlists set changes_seen_at = coalesce(created_at, now())
where changes_seen_at is null;

create index if not exists watchlists_seen_idx on watchlists(investor_id, changes_seen_at);
