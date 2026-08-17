-- 064 — Editing a live listing no longer delists it.
--
-- Saving the edit form on an active listing used to flip status back to
-- pending_review: a founder fixing a typo vanished from the marketplace until
-- an admin re-approved. Listings now stay live; instead the save stamps
-- edited_since_review_at so admins see "edited since approval" in the queue
-- and can re-check (or clear the flag). Approve/verify clear it.
alter table startups add column if not exists edited_since_review_at timestamptz;
create index if not exists startups_edited_since_review_idx
  on startups(edited_since_review_at) where edited_since_review_at is not null;
