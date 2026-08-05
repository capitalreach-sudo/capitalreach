-- Structured due-diligence checklist on a deal. Items belong to the deal;
-- the deal's own RLS (owner, team via API, admin) is the gate -- these
-- policies mirror deals' visibility by joining through it.
create table if not exists deal_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references deals(id) on delete cascade,
  label      text not null,
  done       boolean not null default false,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists deal_checklist_deal_idx on deal_checklist_items (deal_id, position);
alter table deal_checklist_items enable row level security;
create policy deal_checklist_via_deal on deal_checklist_items for all
  using (exists (select 1 from deals d where d.id = deal_checklist_items.deal_id))
  with check (exists (select 1 from deals d where d.id = deal_checklist_items.deal_id));
