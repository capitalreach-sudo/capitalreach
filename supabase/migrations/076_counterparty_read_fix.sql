-- 076 — fixes 075.
--
-- 075 added a policy on `startups` whose USING clause selected from `deals`.
-- `deals` has its own policy that selects from `startups`, so evaluating
-- either one re-entered the other: Postgres raised 42P17 "infinite recursion
-- detected in policy for relation startups", and because the public listing
-- page reads through the caller's own client, EVERY listing 404'd.
--
-- The fix is the pattern this schema already uses for team membership
-- (is_startup_member / is_investor_member): a SECURITY DEFINER function.
-- It runs as its owner, so the tables it touches are read without invoking
-- their policies, and the recursion cannot form.
create or replace function is_deal_counterparty(p_startup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from deals d
    join investors i on i.id = d.investor_id
    where d.startup_id = p_startup_id
      and d.status <> 'passed'
      and i.owner_id = auth.uid()
  );
$$;

revoke all on function is_deal_counterparty(uuid) from public;
grant execute on function is_deal_counterparty(uuid) to authenticated;

-- Scoped to `authenticated`: an anonymous visitor has no deals, so making
-- them evaluate this on every public page read would be pure cost.
drop policy if exists startups_counterparty_read on startups;
create policy startups_counterparty_read on startups
  for select to authenticated
  using (is_deal_counterparty(id));
