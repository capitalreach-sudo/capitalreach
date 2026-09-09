-- 118_offers_and_fee_enforcement.sql
--
-- Two things the platform still lacked, and both are load-bearing.
--
-- A. CONTACT COSTS AN ACCEPTED OFFER.
--    Until now an investor could message a founder freely and only later
--    record a deal. That is the wrong way round: the conversation is the
--    valuable thing, so it is what the deal record should buy. From here,
--    an investor opens with an OFFER -- an amount and terms, which may
--    differ from what the company is asking -- the founder accepts,
--    declines, or counters, and only an accepted offer opens a thread.
--    Circumvention stops being something to detect after the fact: there is
--    no conversation that is not already on the record.
--
-- B. AN UNPAID FEE HAS CONSEQUENCES.
--    Closing a round bills 2%. Three reminders went out and then nothing
--    happened, ever. A fee with no consequence is a donation.

-- ── A. Counter-offers ────────────────────────────────────────────────────
-- A counter is a new proposal that answers an earlier one, so the chain is
-- readable end to end: who asked what, what came back, and where it landed.
alter table public.deal_proposals
  add column if not exists counters_id uuid references public.deal_proposals(id) on delete set null,
  -- Terms an investor may put on the table that differ from the listing's
  -- ask. Free-form on purpose: a real term sheet is not an enum, and forcing
  -- one would push the substance into the note anyway.
  add column if not exists equity_pct numeric,
  add column if not exists valuation numeric,
  add column if not exists instrument text,
  add column if not exists conditions text;

create index if not exists deal_proposals_chain_idx
  on public.deal_proposals (counters_id);
-- The open offer per pair, which is what both inboxes read.
create index if not exists deal_proposals_open_idx
  on public.deal_proposals (startup_id, investor_id, status);

-- ── B. Fee enforcement ───────────────────────────────────────────────────
-- Escalation is recorded on the deal that owes the money, so a founder with
-- one unpaid fee and three good ones is never treated as a defaulter, and
-- every step is reversible the moment it is paid.
alter table public.deals
  add column if not exists fee_enforcement text
    check (fee_enforcement in ('none','reminded','listing_paused','account_restricted','resolved')),
  add column if not exists fee_enforced_at timestamptz,
  -- Set when a listing is paused BY enforcement, so lifting it restores the
  -- founder's own round state rather than guessing at one.
  add column if not exists fee_paused_round_state text;

update public.deals set fee_enforcement = 'none' where fee_enforcement is null;

insert into public.platform_config (key, value) values
  -- Days after the invoice before each step. Deliberately generous: an
  -- invoice can sit unseen through a holiday, and the first real consequence
  -- landing at two weeks is firm without being a trap.
  ('fee_pause_days', '14'),
  ('fee_restrict_days', '30'),
  ('fee_enforcement', 'on'),
  -- Contact requires an accepted offer.
  ('offer_before_contact', 'on')
on conflict (key) do nothing;

comment on column public.deals.fee_enforcement is
  'How far escalation has gone on an unpaid success fee. Every step reverses on payment.';
comment on column public.deal_proposals.counters_id is
  'The proposal this one answers, so a negotiation reads as a chain.';
