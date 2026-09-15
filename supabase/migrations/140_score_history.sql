-- 140 -- score_history: every vaultrise_score the model ever produced for a
-- listing, not just the one scalar startups.vaultrise_score holds today.
--
-- startups.vaultrise_score + scored_at is a snapshot, overwritten in place on
-- every approval score and every cron/follow-ups re-score (093). A founder
-- who improves their pitch and gets re-scored higher has no way to see the
-- climb -- the old number is gone the instant the new one lands. This table
-- is an append-only log beside that snapshot: nothing about the existing
-- write path changes, a row is added alongside every UPDATE that already
-- sets vaultrise_score.
--
-- One row per scoring event, never updated once written -- a history you can
-- edit is not a history. `score` mirrors startups.vaultrise_score's own
-- CHECK (0-100); `scored_at` mirrors startups.scored_at so the two stay
-- readable side by side.
--
-- RLS follows the ai_reports shape exactly (same file, same reasoning): the
-- owning founder reads their own rows through the standing
-- `startups.owner_id = auth.uid()` check, no admin policy (see
-- capitalreach-rls-rules -- there are none on this schema). The two write
-- sites (app/api/admin/startup/approve, app/api/cron/follow-ups) both write
-- through the service role, which bypasses RLS entirely, exactly like every
-- other write to startups.vaultrise_score already does.

create table if not exists public.score_history (
  id uuid primary key default uuid_generate_v4(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  scored_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_score_history_startup_id
  on public.score_history (startup_id, scored_at desc);

alter table public.score_history enable row level security;

drop policy if exists "score_history_owner_read" on public.score_history;
create policy "score_history_owner_read" on public.score_history for select using (
  exists (select 1 from public.startups where id = startup_id and owner_id = auth.uid())
);
