-- 097: is_demo on startups & investors, backfilled from the seeded account
-- domains. Real users are about to arrive, and a platform full of unmarked
-- fictional companies is a trust incident waiting to happen: one investor
-- who discovers a listing is fake never comes back. Sample data stays (an
-- empty marketplace is its own trust problem) but it says what it is.
alter table public.startups  add column if not exists is_demo boolean not null default false;
alter table public.investors add column if not exists is_demo boolean not null default false;

update public.startups s set is_demo = true
  from auth.users u where u.id = s.owner_id
  and (u.email like '%@capitalreach.test' or u.email like '%@capitalreach.demo');
update public.investors i set is_demo = true
  from auth.users u where u.id = i.owner_id
  and (u.email like '%@capitalreach.test' or u.email like '%@capitalreach.demo');
