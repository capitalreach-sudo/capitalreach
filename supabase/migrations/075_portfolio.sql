-- 075 — D40 portfolio monitoring, D41 backed companies must not vanish.

-- D40: what a position actually was, snapshotted at close. Deriving it later
-- from the startup's *current* valuation would silently restate history
-- every time the company raised again.
alter table deals
  add column if not exists ownership_percent   numeric,
  add column if not exists valuation_at_close   numeric;

-- D41: startups are readable when active, or by their owner/team. So the
-- moment a listing was archived or suspended, the investor who had actually
-- funded it lost the company from their own portfolio — the row they were
-- entitled to more than anyone became invisible. A counterparty on a live
-- (non-passed) deal can always read the company they backed.
drop policy if exists startups_counterparty_read on startups;
create policy startups_counterparty_read on startups
  for select using (
    exists (
      select 1
      from deals d
      join investors i on i.id = d.investor_id
      where d.startup_id = startups.id
        and d.status <> 'passed'
        and i.owner_id = auth.uid()
    )
  );
