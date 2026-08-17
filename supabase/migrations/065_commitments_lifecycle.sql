-- 065 — Sprint B: commitments (B17), public momentum (B19), listing lifecycle (B16).

-- B17: "we're in for €50k" had no state. A deal's amount existed but nothing
-- said whether it was an ask, a soft-circle, a verbal yes, or a signed
-- commitment. The founder's raise tracker reads these from day 0.
alter table deals
  add column if not exists commitment_type text
    check (commitment_type in ('interest','soft_circle','verbal','committed')),
  add column if not exists commitment_at timestamptz;
update deals set commitment_type = 'interest' where commitment_type is null and status in ('intro','due_diligence');
update deals set commitment_type = 'committed' where commitment_type is null and status in ('term_sheet','closed');

-- B16: founder-controlled round state with a public badge. status stays the
-- admin/moderation axis (draft/pending_review/active/suspended/archived);
-- round_state is the founder's own lever on an active listing.
alter table startups
  add column if not exists round_state text not null default 'open'
    check (round_state in ('open','paused','oversubscribed','closed')),
  add column if not exists round_state_changed_at timestamptz;
create index if not exists startups_round_state_idx on startups(round_state) where status = 'active';

-- B19: opt-in public momentum ("€310k of €500k · 6 committed · 14 interested").
alter table startups
  add column if not exists show_momentum boolean not null default false;
