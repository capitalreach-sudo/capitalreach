-- 106 - one thread per investor pair when there is no startup anchor.
--
-- Migration 070's threads_investor_pair_idx is UNIQUE on
-- (startup_id, least(investor, recipient), greatest(...)), and Postgres treats
-- NULLs as distinct in unique indexes -- so the investor-to-investor threads
-- introduced in 098 (startup_id NULL) had no uniqueness at all. Two concurrent
-- "message this investor" clicks both found no existing thread and both
-- inserted, splitting one conversation across duplicate rows.
--
-- Duplicates that already exist would break CREATE UNIQUE INDEX, so the
-- newest duplicates are first folded into the oldest thread per pair:
-- messages are moved, then the empty duplicates deleted.
with ranked as (
  select id,
         first_value(id) over (
           partition by least(investor_id, recipient_investor_id),
                        greatest(investor_id, recipient_investor_id)
           order by created_at asc, id asc
         ) as keep_id
  from threads
  where startup_id is null and recipient_investor_id is not null
)
update messages m
set thread_id = r.keep_id
from ranked r
where m.thread_id = r.id and r.id <> r.keep_id;

with ranked as (
  select id,
         first_value(id) over (
           partition by least(investor_id, recipient_investor_id),
                        greatest(investor_id, recipient_investor_id)
           order by created_at asc, id asc
         ) as keep_id
  from threads
  where startup_id is null and recipient_investor_id is not null
)
delete from threads t
using ranked r
where t.id = r.id and r.id <> r.keep_id;

create unique index if not exists threads_investor_pair_nostartup_idx
  on threads (least(investor_id, recipient_investor_id),
              greatest(investor_id, recipient_investor_id))
  where startup_id is null and recipient_investor_id is not null;
