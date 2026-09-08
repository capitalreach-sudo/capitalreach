-- 114_round_closure_declarations.sql
--
-- The fee leaks at exactly one moment: a founder meets an investor here,
-- both go quiet, the round closes elsewhere, and nobody ever says so.
-- Detection alone cannot fix that -- a sweep raises suspicion, and suspicion
-- does not get invoiced.
--
-- What closes it is a DECLARATION. Ending a round now asks the founder a
-- direct question, with the investors CapitalReach introduced them to listed
-- on screen: did any of these participate? Answering "no" stops being an
-- omission and becomes a dated, recorded, signed statement made against a
-- named list. That is the difference between a founder who forgot and a
-- founder who said something untrue, and it is the only version a fee claim
-- can actually rest on.

create table if not exists public.round_closures (
  id            uuid primary key default gen_random_uuid(),
  startup_id    uuid not null references public.startups(id) on delete cascade,
  declared_by   uuid not null references auth.users(id) on delete cascade,

  outcome       text not null check (outcome in
                  ('closed_with_platform_investor','closed_other_investors','closed_no_raise','withdrawn')),

  -- Who the founder says took part. Platform investors by id; anyone else by
  -- name, because an honest founder often raised from someone we never knew.
  declared_investor_ids uuid[] not null default '{}',
  declared_external     text,

  amount_raised numeric,
  currency      text,

  -- The cross-check, computed and frozen at declaration time. Recomputing it
  -- later against a changed introduction set would be rewriting the evidence.
  introduced_in_tail    uuid[] not null default '{}',
  -- Introduced, tail still live, and NOT declared. Not an accusation -- the
  -- list a human looks at, alongside what that investor actually accessed.
  undeclared_introduced uuid[] not null default '{}',

  -- What they agreed to when they said it.
  attestation_version text not null,
  ip            text,
  user_agent    text,
  declared_at   timestamptz not null default now()
);
create index if not exists round_closures_startup_idx
  on public.round_closures (startup_id, declared_at desc);
-- The review queue: closures that contradict the introduction record.
create index if not exists round_closures_flagged_idx
  on public.round_closures (declared_at desc)
  where cardinality(undeclared_introduced) > 0;

alter table public.round_closures enable row level security;
-- Service-role only, like every other evidence table: the founder reads their
-- own through a route, and admins through the review bench.

-- How public a listing's DETAIL page is. The browse index stays open either
-- way -- names, sectors and stages are a shopfront, and a market nobody can
-- see looks dead. The detail page is different: problem, solution, market,
-- competitive advantage and use of funds ARE the idea, and Jack's call is
-- that the idea is not for anonymous readers.
--
--   open     -- anyone may read a listing in full
--   members  -- signed-in accounts only
insert into public.platform_config (key, value)
values ('public_listing_detail', 'members')
on conflict (key) do nothing;

comment on table public.round_closures is
  'The founder''s dated statement of who participated in a closed round, checked against who we introduced.';
