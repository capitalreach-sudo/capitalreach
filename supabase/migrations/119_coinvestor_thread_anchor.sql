-- 119 - an investor pair's thread carries no startup anchor.
--
-- Two failures, one shape.
--
-- (1) 098 dropped the NOT NULL on threads.startup_id so two investors could
-- talk with no company between them, but 012's threads_no_self_message stayed
-- as written: `startup_id IS DISTINCT FROM recipient_startup_id`. Both columns
-- are NULL on a direct investor pair thread, and NULL IS DISTINCT FROM NULL is
-- FALSE, so every such INSERT failed the check -- /api/messages/start answered
-- 500 "Could not start conversation" for investor to investor. Restated null
-- safe: the rule only has something to say once both columns are filled.
--
-- (2) /api/deals/share anchored its co-investor thread to the company:
-- (startup_id, investor_id, recipient_investor_id). That row occupies the very
-- (startup_id, investor_id) slot the founder/investor thread uses, and that
-- pair is how every lookup on the platform finds a conversation --
-- /api/messages/send, /api/messages/start, deal registration's message count,
-- the close route's amount check. A founder-directed message delivered into
-- one of those lands where /api/messages/reply refuses the founder (a
-- co-investor thread has exactly two investors as parties), while the other
-- investor reads it. The route now opens the pair's anchorless thread; the
-- rows it already wrote are folded here, one per pair, oldest kept -- the same
-- fold 106 had to do for duplicates.
--
-- thread_archives and thread_flags ride their FK cascade: a star or an archive
-- flag on a folded duplicate is one user's preference, not conversation.

alter table public.threads drop constraint if exists threads_no_self_message;
alter table public.threads add constraint threads_no_self_message check (
  startup_id is null
  or recipient_startup_id is null
  or startup_id <> recipient_startup_id
);

with ranked as (
  select id,
         first_value(id) over (
           partition by least(investor_id, recipient_investor_id),
                        greatest(investor_id, recipient_investor_id)
           order by created_at asc, id asc
         ) as keep_id
  from threads
  where recipient_investor_id is not null and investor_id is not null
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
  where recipient_investor_id is not null and investor_id is not null
)
update startup_shares s
set thread_id = r.keep_id
from ranked r
where s.thread_id = r.id and r.id <> r.keep_id;

with ranked as (
  select id,
         first_value(id) over (
           partition by least(investor_id, recipient_investor_id),
                        greatest(investor_id, recipient_investor_id)
           order by created_at asc, id asc
         ) as keep_id
  from threads
  where recipient_investor_id is not null and investor_id is not null
)
delete from threads t
using ranked r
where t.id = r.id and r.id <> r.keep_id;

-- One survivor per pair by now, so dropping the anchor cannot collide with
-- 106's unique index.
update threads
set startup_id = null
where recipient_investor_id is not null
  and investor_id is not null
  and startup_id is not null;
