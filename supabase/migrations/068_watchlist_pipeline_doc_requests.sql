-- 068 — Sprint C: watchlist becomes a pipeline (C26); document requests
-- become a real table (C28).

-- C26: a bookmark list with no state is a pile. Status + priority turn it
-- into a triage board; updated_at drives "recently touched".
alter table watchlists
  add column if not exists status text not null default 'watching'
    check (status in ('watching','reviewing','contacted','passed')),
  add column if not exists priority smallint not null default 0
    check (priority between 0 and 3),
  add column if not exists updated_at timestamptz;

-- C28: a document request was a fire-and-forget notification. Now it is a
-- row with a status, so the founder has an outstanding block, the investor
-- sees what came back, and a cron can nudge.
create table if not exists document_requests (
  id                     uuid primary key default gen_random_uuid(),
  startup_id             uuid not null references startups(id) on delete cascade,
  investor_id            uuid not null references investors(id) on delete cascade,
  deal_id                uuid references deals(id) on delete set null,
  doc_type               text not null,
  message                text,
  status                 text not null default 'open' check (status in ('open','fulfilled','declined')),
  fulfilled_document_id  uuid,
  reminded_at            timestamptz,
  created_at             timestamptz not null default now(),
  resolved_at            timestamptz
);
create index if not exists document_requests_startup_open_idx on document_requests(startup_id, status, created_at desc);
create index if not exists document_requests_investor_idx on document_requests(investor_id, created_at desc);
alter table document_requests enable row level security;
drop policy if exists document_requests_investor_read on document_requests;
create policy document_requests_investor_read on document_requests
  for select using (exists (select 1 from investors i where i.id = document_requests.investor_id and i.owner_id = auth.uid()));
drop policy if exists document_requests_founder_read on document_requests;
create policy document_requests_founder_read on document_requests
  for select using (exists (select 1 from startups s where s.id = document_requests.startup_id and s.owner_id = auth.uid()));
-- Writes: service role only (the API stamps and notifies).
