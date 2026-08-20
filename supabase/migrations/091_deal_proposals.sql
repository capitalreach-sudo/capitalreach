-- 091 — a deal now needs the other side's consent before it exists.
--
-- Until now either party could unilaterally place a deal in the OTHER side's
-- pipeline: an investor expressing interest instantly created a row on the
-- founder's board, and a founder could put any platform investor into their
-- own funnel. A deal is a relationship, and one party cannot declare a
-- relationship on behalf of two.
--
-- A proposal carries everything the deal would have been created with, so
-- accepting reproduces exactly what the proposer asked for — amount, opening
-- stage, note, and (for investor-initiated ones) the non-circumvention ack
-- they signed at proposal time.
--
-- The one deliberate exception, in the API rather than here: a founder's
-- off-platform ("external") investors have no account and therefore nobody to
-- consent — those pipeline entries stay direct, as do admin-created deals.
create table if not exists deal_proposals (
  id                    uuid primary key default gen_random_uuid(),
  startup_id            uuid not null references startups(id) on delete cascade,
  investor_id           uuid not null references investors(id) on delete cascade,
  proposed_by           uuid not null references auth.users(id) on delete cascade,
  from_side             text not null check (from_side in ('startup','investor')),
  status                text not null default 'pending'
                          check (status in ('pending','accepted','declined','withdrawn')),
  amount                numeric,
  currency              text,
  opening_status        text not null default 'intro'
                          check (opening_status in ('intro','due_diligence','term_sheet')),
  note                  text,
  next_follow_up        date,
  circumvention_ack_id  uuid,
  resolved_at           timestamptz,
  created_at            timestamptz not null default now()
);

-- One live proposal per pair, same discipline as deals_one_open_per_pair.
create unique index if not exists deal_proposals_one_open_per_pair
  on deal_proposals(startup_id, investor_id) where status = 'pending';
create index if not exists deal_proposals_startup_idx on deal_proposals(startup_id, status);
create index if not exists deal_proposals_investor_idx on deal_proposals(investor_id, status);

alter table deal_proposals enable row level security;
-- Both parties may read; all writes go through the API (service role), which
-- is where "only the recipient may accept" is enforced — a check constraint
-- cannot know who the caller is.
drop policy if exists deal_proposals_parties_read on deal_proposals;
create policy deal_proposals_parties_read on deal_proposals for select to authenticated
  using (
    exists (select 1 from startups s where s.id = deal_proposals.startup_id and s.owner_id = auth.uid())
    or exists (select 1 from investors i where i.id = deal_proposals.investor_id and i.owner_id = auth.uid())
  );
