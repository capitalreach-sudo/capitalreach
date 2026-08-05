-- Q&A on a listing: investors ask, founders answer, answered questions are
-- public on the profile. Unanswered ones are visible only to asker + founder
-- (enforced in the API; RLS gives read to all for answered rows and to the
-- asking investor's owner for their own).
create table if not exists listing_questions (
  id          uuid primary key default gen_random_uuid(),
  startup_id  uuid not null references startups(id) on delete cascade,
  investor_id uuid not null references investors(id) on delete cascade,
  question    text not null,
  answer      text,
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists listing_questions_startup_idx on listing_questions (startup_id, created_at desc);
alter table listing_questions enable row level security;
create policy listing_questions_public_answered on listing_questions for select using (answer is not null);
create policy listing_questions_own_asker on listing_questions for select
  using (exists (select 1 from investors i where i.id = listing_questions.investor_id and i.owner_id = auth.uid()));
create policy listing_questions_founder on listing_questions for select
  using (exists (select 1 from startups s where s.id = listing_questions.startup_id and s.owner_id = auth.uid()));
