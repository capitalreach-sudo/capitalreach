-- 050: monthly metric history, so traction can be a curve instead of a claim.
--
-- The listing shows MRR as a single number, which proves nothing -- any
-- number is "up and to the right" if you only show one. Founders record a
-- monthly snapshot here; the listing draws the curve for viewers whose plan
-- already sees financials (the same gate the single number sits behind).
--
-- month is the first of the month; one row per listing per month, upserted --
-- correcting last month's typo beats an append-only ledger for this use.
-- Service-role only (RLS enabled, no policies): writes go through an API
-- that checks ownership, reads through the listing page's own gating.
create table if not exists startup_metrics (
  id               uuid primary key default uuid_generate_v4(),
  startup_id       uuid not null references startups(id) on delete cascade,
  month            date not null,
  mrr              numeric,
  arr              numeric,
  user_count       integer,
  paying_customers integer,
  created_at       timestamptz not null default now(),
  unique (startup_id, month)
);

alter table startup_metrics enable row level security;

create index if not exists startup_metrics_series_idx
  on startup_metrics (startup_id, month desc);
