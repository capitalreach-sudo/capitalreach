-- 066 — B20: Q&A can be answered privately; founder sees who asked.
alter table listing_questions
  add column if not exists is_private boolean not null default false,
  add column if not exists answered_by uuid references profiles(id) on delete set null;

-- Public read is now "answered AND not private". Asker and founder policies
-- (038) already cover the private ones.
drop policy if exists listing_questions_public_answered on listing_questions;
create policy listing_questions_public_answered on listing_questions
  for select using (answer is not null and is_private = false);
