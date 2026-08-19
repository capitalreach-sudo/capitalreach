-- 071 — C30: reusable diligence checklists, and the fields that make a
-- checklist item actionable rather than a to-do label.
alter table deal_checklist_items
  add column if not exists due_date date,
  add column if not exists owner_side text check (owner_side in ('startup','investor')),
  add column if not exists evidence text;

create table if not exists investor_checklist_templates (
  id           uuid primary key default gen_random_uuid(),
  investor_id  uuid not null references investors(id) on delete cascade,
  name         text not null,
  items        jsonb not null default '[]'::jsonb,  -- [{ label, owner_side?, offset_days? }]
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists investor_checklist_templates_idx on investor_checklist_templates(investor_id, created_at desc);
alter table investor_checklist_templates enable row level security;
drop policy if exists investor_checklist_templates_own on investor_checklist_templates;
create policy investor_checklist_templates_own on investor_checklist_templates
  for all using (exists (select 1 from investors i where i.id = investor_checklist_templates.investor_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from investors i where i.id = investor_checklist_templates.investor_id and i.owner_id = auth.uid()));
