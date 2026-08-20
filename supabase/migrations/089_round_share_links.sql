-- 089 — a founder's own share link for their round.
--
-- The listing page is already public: an anonymous visitor sees the pitch, the
-- problem, the solution and the ask. So the wall people describe is not on the
-- page — it is on the DECK. A founder sharing their round in a WhatsApp group
-- or an email thread has no way to let those people see the deck without each
-- of them creating an account first, and no way to know whether anybody
-- opened it.
--
-- A share link is a revocable token the founder generates themselves. It can
-- optionally carry deck access for whoever holds it, and it records opens, so
-- "I sent it to eleven angels" becomes "four of them read it".
create table if not exists round_shares (
  id            uuid primary key default gen_random_uuid(),
  startup_id    uuid not null references startups(id) on delete cascade,
  token         text not null unique,
  -- The founder's own note about who this link went to. Never shown to whoever
  -- opens it: "the angels from the Berlin dinner" is a reminder, not a label.
  label         text,
  -- Whether holders of this link may read documents without an account. Off by
  -- default: sharing a deck with the internet is a decision, not a default.
  grants_documents boolean not null default false,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  opens         int not null default 0,
  last_opened_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists round_shares_startup_idx on round_shares(startup_id, created_at desc);
create index if not exists round_shares_token_idx on round_shares(token)
  where revoked_at is null;

alter table round_shares enable row level security;
-- The founder manages their own links. Looking one UP by token happens
-- server-side through the service role: a policy that allowed reading by token
-- would also allow enumerating every founder's private share notes.
drop policy if exists round_shares_own on round_shares;
create policy round_shares_own on round_shares for all to authenticated
  using (exists (select 1 from startups s where s.id = round_shares.startup_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from startups s where s.id = round_shares.startup_id and s.owner_id = auth.uid()));
