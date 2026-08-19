-- 085 — F: listings that were started and never finished.
--
-- A founder creates a listing, fills in half of it, gets pulled into a
-- customer call, and the draft sits there. Nothing on the platform ever
-- mentioned it again — no reminder, no "you are two fields from being live".
-- Drafts are the cheapest supply the marketplace will ever have: the person
-- already decided to be here.
alter table startups
  add column if not exists draft_nudged_at    timestamptz,
  add column if not exists draft_nudge_count  int not null default 0;
