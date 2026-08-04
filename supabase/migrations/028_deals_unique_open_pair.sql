-- One open deal per startup/investor pair, enforced by the database.
--
-- /api/deals/create already checks this before inserting, but an app-level
-- check has a race window (two concurrent requests both see "no open deal"
-- and both insert). Staging accumulated exactly such duplicates before the
-- app check existed. The partial index makes the invariant unconditional
-- while still allowing a new deal once the previous one is closed or passed.
create unique index if not exists deals_one_open_per_pair
  on deals (startup_id, investor_id)
  where status not in ('closed', 'passed');
