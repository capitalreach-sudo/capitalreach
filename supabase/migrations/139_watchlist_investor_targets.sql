-- 139 -- an investor can watchlist another investor.
--
-- watchlists has always been one thing: (investor_id, startup_id) rows, a
-- bookmark an investor puts on a company. The smallest change that lets an
-- investor bookmark a fellow investor is to let the row point at either kind
-- of target, not to build a second table with its own RLS, its own indexes
-- and its own dashboard query to keep in sync with the first.
--
-- startup_id becomes nullable, target_investor_id joins it as its mirror, and
-- a CHECK enforces that a row is EXACTLY one kind -- never both, never
-- neither. The two existing indexes (watchlists_investor_id_startup_id_key,
-- idx_watchlists_startup_id) already cope with startup_id being NULL for the
-- new kind of row without any change: Postgres unique constraints treat NULL
-- as distinct from NULL, so every investor-target row (startup_id NULL) is
-- invisible to that constraint and that index, exactly as if the column
-- didn't apply to it.
--
-- target_investor_id gets its own UNIQUE(investor_id, target_investor_id) --
-- deliberately a full constraint, not a partial index scoped to
-- "WHERE target_investor_id IS NOT NULL". A partial index cannot be named as
-- an ON CONFLICT arbiter by a plain column list (Postgres only infers a
-- partial index when the conflict clause repeats its WHERE predicate, which
-- PostgREST's onConflict option has no way to express), and the API route's
-- upsert needs a plain (investor_id, target_investor_id) arbiter. A full
-- constraint works here for the same NULL-distinctness reason: every
-- startup-kind row carries target_investor_id NULL, so those rows never
-- collide with each other or with the new constraint.
--
-- No RLS change. watchlists_own and watchlists_team both key off
-- investor_id, which every row -- either kind -- already carries; a save
-- follows the saving investor's own access exactly as a startup save always
-- has, no admin policy needed (see capitalreach-rls-rules).
--
-- Scope, deliberately: this is a bookmark, not a channel. Nothing here grants
-- the watched investor visibility into who watched them, and nothing here
-- touches messages/threads -- the standing rule this session is that
-- messaging opens only between the two sides of a sealed deal (or admin).
-- Investor-to-investor messaging is already refused elsewhere
-- (/api/messages/start, app/investors/[slug]/page.tsx); this migration adds
-- no new path around that.

alter table public.watchlists
  alter column startup_id drop not null;

alter table public.watchlists
  add column if not exists target_investor_id uuid references public.investors(id) on delete cascade;

-- Exactly one target per row -- a save that points at nothing, or at both a
-- startup and an investor, is not a bookmark, it's a data bug.
alter table public.watchlists
  add constraint watchlists_target_kind_check
  check ((startup_id is not null) <> (target_investor_id is not null));

-- An investor cannot watch themselves -- there is nothing to track.
alter table public.watchlists
  add constraint watchlists_no_self_watch
  check (target_investor_id is null or target_investor_id <> investor_id);

-- The upsert arbiter for POST /api/watchlist's targetInvestorId path (see the
-- note above on why this is a full constraint, not a partial index).
alter table public.watchlists
  add constraint watchlists_investor_target_investor_key
  unique (investor_id, target_investor_id);

-- Mirrors idx_watchlists_startup_id -- cheap now, and exactly what a future
-- "who's watching me" read would need; nothing today queries it.
create index if not exists idx_watchlists_target_investor_id
  on public.watchlists(target_investor_id)
  where target_investor_id is not null;
