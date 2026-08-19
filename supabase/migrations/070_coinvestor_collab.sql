-- 070 — Sprint C collaboration: shares as records (C31), investor↔investor
-- threads (C32), opt-in co-investor visibility (C33).

-- C31: "share with a partner" sent a notification and dropped the note on
-- the floor. A share is now a record both sides can find again.
create table if not exists startup_shares (
  id               uuid primary key default gen_random_uuid(),
  startup_id       uuid not null references startups(id) on delete cascade,
  from_investor_id uuid not null references investors(id) on delete cascade,
  to_investor_id   uuid not null references investors(id) on delete cascade,
  note             text,
  thread_id        uuid references threads(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (startup_id, from_investor_id, to_investor_id)
);
create index if not exists startup_shares_to_idx on startup_shares(to_investor_id, created_at desc);
alter table startup_shares enable row level security;
drop policy if exists startup_shares_participants on startup_shares;
create policy startup_shares_participants on startup_shares
  for select using (
    exists (select 1 from investors i where i.owner_id = auth.uid()
            and (i.id = startup_shares.from_investor_id or i.id = startup_shares.to_investor_id))
  );

-- C32: investor ↔ investor threads on the existing thread infrastructure.
-- startup_id stays required: a co-investor conversation is about a company,
-- and keeping it means every existing query and index still works.
alter table threads add column if not exists recipient_investor_id uuid references investors(id) on delete cascade;
create unique index if not exists threads_investor_pair_idx
  on threads (startup_id, least(investor_id, recipient_investor_id), greatest(investor_id, recipient_investor_id))
  where recipient_investor_id is not null;

drop policy if exists "Participants can view threads" on threads;
create policy "Participants can view threads"
  on threads for select
  using (
    startup_id in (select id from startups where owner_id = auth.uid())
    or investor_id in (select id from investors where owner_id = auth.uid())
    or recipient_startup_id in (select id from startups where owner_id = auth.uid())
    or recipient_investor_id in (select id from investors where owner_id = auth.uid())
  );

drop policy if exists "Participants can update threads" on threads;
create policy "Participants can update threads"
  on threads for update
  using (
    startup_id in (select id from startups where owner_id = auth.uid())
    or investor_id in (select id from investors where owner_id = auth.uid())
    or recipient_startup_id in (select id from startups where owner_id = auth.uid())
    or recipient_investor_id in (select id from investors where owner_id = auth.uid())
  );

drop policy if exists "Thread participants can read messages" on messages;
create policy "Thread participants can read messages"
  on messages for select
  using (
    exists (
      select 1 from threads t
      where t.id = thread_id
        and (t.startup_id in (select id from startups where owner_id = auth.uid())
             or t.investor_id in (select id from investors where owner_id = auth.uid())
             or t.recipient_startup_id in (select id from startups where owner_id = auth.uid())
             or t.recipient_investor_id in (select id from investors where owner_id = auth.uid()))
    )
  );

-- C33: opt-in co-investor visibility. Off by default; an investor decides
-- per deal whether other investors on the platform may see that they are
-- looking. Never exposes amounts or stage — only that interest exists.
alter table deals add column if not exists public_interest boolean not null default false;
create index if not exists deals_public_interest_idx on deals(startup_id) where public_interest = true;
