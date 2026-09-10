-- 120 - a deal is sealed by both parties, and the seal is what opens the
-- conversation.
--
-- The order has tightened once already. It used to be: talk for weeks, then
-- maybe record a deal. Then: make an offer, have it accepted, and the thread
-- opens (118). This is the last step of the same argument -- an accepted offer
-- is one party's yes, and a yes is not a record either side has signed.
--
-- So acceptance now creates the deal and the deal is DRAFT until both parties
-- countersign it. The document they sign names the terms they accepted, the
-- 2% due on close, and the non-circumvention tail -- the bilateral counterpart
-- of the one-sided undertaking in lib/circumvention-text.ts, which the
-- investor accepts before they may make an offer at all. Only when the second
-- signature lands does deals.sealed_at fill in, and only then may either side
-- send the other a message.
--
-- What makes it evidence rather than a checkbox: the hash. seal_sha256 is
-- sha256 over the exact bytes of the document that was on screen, terms
-- included, so neither party can later say the deal was for other numbers.
-- A version string alone proves nothing if the wording is edited without a
-- bump. Same reasoning as nda_records.text_sha256 (113).
--
-- Service-role only, deliberately. deal_seals carries IP addresses and is the
-- record a fee claim rests on, so it gets RLS with NO permissive policy, the
-- same shape as verification_evidence and nda_disclosures (111, 113). Every
-- read and write goes through server code that has already authenticated its
-- caller.

create table if not exists public.deal_seals (
  id              uuid primary key default gen_random_uuid(),
  deal_id         uuid not null references public.deals(id) on delete cascade,
  -- Which side of the table signed. One signature per side, hence the unique
  -- below: a founder cannot sign twice and call the deal sealed.
  party           text not null check (party in ('startup', 'investor')),
  signer_user_id  uuid not null references auth.users(id) on delete cascade,
  -- Typed by the signer. A team member may sign for their entity, so the name
  -- on the record is not necessarily the entity's name.
  signed_name     text not null,
  seal_version    text not null,
  seal_sha256     text not null,
  ip_address      text,
  user_agent      text,
  signed_at       timestamptz not null default now(),
  unique (deal_id, party)
);

alter table public.deal_seals enable row level security;

create index if not exists deal_seals_deal_idx on public.deal_seals (deal_id);

alter table public.deals
  add column if not exists sealed_at    timestamptz,
  add column if not exists seal_sha256  text,
  add column if not exists seal_version text;

create index if not exists deals_sealed_idx on public.deals (sealed_at)
  where sealed_at is not null;

-- Deals that already exist keep their conversations. The rule is for what
-- happens next, and retroactively cutting off pairs who are mid-diligence
-- would punish them for the platform changing its mind. Backfilled as sealed
-- with a null hash, which is exactly what "grandfathered, never countersigned"
-- should look like to anyone reading the table later.
update public.deals
set sealed_at = coalesce(sealed_at, created_at),
    seal_version = coalesce(seal_version, 'grandfathered')
where sealed_at is null;

comment on table public.deal_seals is
  'One signature per party per deal. Both present means deals.sealed_at is set and the pair may message. Service role only.';
comment on column public.deals.seal_sha256 is
  'sha256 of the exact document both parties signed. Null on grandfathered deals that predate 120.';

-- The seal raises two notifications of its own, so the CHECK that lib/notify-user's
-- union is pinned to has to learn them in the same migration. tests/notification-types
-- fails the build if these four places (constraint, union, TYPE_ICON, the test's list)
-- ever drift apart, which is the point.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check CHECK (type IN (
  'deal_opened', 'deal_stage', 'deal_closed', 'deal_passed', 'message', 'follow_up_due',
  'contract_status', 'nda_signed', 'listing_approved', 'listing_rejected', 'team_added',
  'tier_changed', 'search_match', 'listing_saved', 'listing_update', 'doc_request',
  'deal_shared', 'question_asked', 'question_answered', 'verified', 'fee_due',
  'complaint_update', 'interest', 'admin_alert', 'deal_sealed', 'deal_seal_pending'
));
