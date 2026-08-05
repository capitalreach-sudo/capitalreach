-- Which investor opened which document: the strongest intent signal a
-- founder can get. One row per open; the founder panel aggregates.
create table if not exists document_views (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references startup_documents(id) on delete cascade,
  investor_id uuid not null references investors(id) on delete cascade,
  viewed_at   timestamptz not null default now()
);
create index if not exists document_views_doc_idx on document_views (document_id, viewed_at desc);
alter table document_views enable row level security;
create policy document_views_insert_own on document_views for insert
  with check (exists (select 1 from investors i where i.id = document_views.investor_id and i.owner_id = auth.uid()));
