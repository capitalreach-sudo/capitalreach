-- 122 - a countered round says it was countered.
--
-- 091 gave deal_proposals.status four values: pending, accepted, declined,
-- withdrawn. There was no way to say "answered with a counter", so
-- closeAsCountered() in app/api/deals/proposals writes 'countered', watches the
-- constraint reject it, and falls back to 'declined'.
--
-- That fallback kept the mechanism working and told the reader a lie. A
-- founder who countered an offer with better terms had that round recorded as
-- a refusal, and now that the deal portal renders the whole chain, the lie is
-- on screen: round one of a live negotiation labelled "declined" underneath
-- round two.
--
-- The fallback stays in the code. It costs one query on a path that will now
-- never take it, and it is the reason this was a wrong label rather than a
-- 500 for however long the constraint was behind.

alter table public.deal_proposals drop constraint if exists deal_proposals_status_check;
alter table public.deal_proposals add constraint deal_proposals_status_check
  check (status = any (array['pending', 'accepted', 'declined', 'withdrawn', 'countered']));

-- Rounds that were answered by a counter and recorded as declined. The
-- evidence is counters_id: another proposal points at them, which only a
-- counter ever does. A round the other side genuinely declined has nothing
-- pointing at it and keeps its status.
update public.deal_proposals p
set status = 'countered'
where p.status = 'declined'
  and exists (select 1 from public.deal_proposals c where c.counters_id = p.id);

comment on column public.deal_proposals.status is
  'pending, accepted, declined, withdrawn, or countered. A countered round was answered with new terms, not refused.';
