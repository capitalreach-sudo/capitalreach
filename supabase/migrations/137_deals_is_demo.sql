-- Denormalized is_demo on deals, matching the startups/investors pattern.
-- Public aggregates (lib/platform-data.ts) select deals standalone via
-- pagination, so a join-time filter against startups/investors would need
-- a second round trip per page; a column here lets it filter in one query,
-- same as the existing startups.is_demo / investors.is_demo columns.
alter table public.deals add column if not exists is_demo boolean not null default false;

update public.deals d
   set is_demo = true
  from public.startups s
 where d.startup_id = s.id
   and s.is_demo = true
   and d.is_demo = false;

update public.deals d
   set is_demo = true
  from public.investors i
 where d.investor_id = i.id
   and i.is_demo = true
   and d.is_demo = false;

create index if not exists idx_deals_is_demo on public.deals (is_demo);
