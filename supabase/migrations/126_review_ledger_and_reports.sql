-- 126 - what was actually checked, and what happens when somebody says it is
-- wrong.
--
-- 111 built the trust LADDER: a case, the evidence under it, a level. 125
-- built the reconciliation of a closed round against two accounts of the
-- amount that neither party wrote. Both answer "is this entity what it
-- claims". Neither leaves anything a viewer can read.
--
-- The viewer's question is blunter than a level: WHAT DID YOU CHECK. A badge
-- that says "verified" and nothing else is the single claim 111 set out to
-- replace, and a platform charging a success fee on an introduction makes a
-- representation every time it shows one. So a review is recorded as the
-- items it went through, the version of the list those items came from, and
-- the outcome, and it is shown WITH ITS GAPS IN IT. A check that was not done
-- is information, and hiding it is the part that would be a lie.
--
-- The checklist is a moment. reports is what happens after it: the incident
-- path, open to a visitor with no account, because the person who knows a
-- company is not what it says it is very often not a member here.
--
-- Nothing below enforces anything. These tables record that a human looked
-- and what they concluded. No trigger suspends an account, raises a fee, or
-- moves a status on its own.
--
--
-- THE RLS DECISION, AND WHY IT IS NOT A POLICY.
--
-- review_checklists exists to be SEEN. That is the whole point: a viewer can
-- see what was and was not checked. But two things in the row must not travel
-- with it. outcome_reason on a REJECTED review is an admin's private
-- judgement about a company, written to be read by the next admin. reviewer_id
-- names the individual who made it. reports is stricter again: the subject
-- must never be able to read a report about themselves, or work out who filed
-- it.
--
-- A policy grants ROWS, not columns. This codebase has already taken both
-- routes out of that, once each:
--
--   111, column-safe, for verification_cases: a policy scoped to the
--   applicant, plus revoke-and-regrant so risk_score and risk_flags never
--   leave the service role. It works there because the row carries owner_id,
--   so "who may read this" is a property of the row itself.
--
--   125, service role only, for document_downloads: RLS on with no policy,
--   and a route that joins to the founder's own documents and projects the
--   ledger down to who and when. It had to be that way because the row holds
--   an investor's identity beside an IP address, and a founder-scoped SELECT
--   would have handed over both together.
--
-- review_checklists is the 125 case, for three separate reasons.
--
--   1. THERE IS NO PREDICATE TO WRITE. verification_cases keys on owner_id.
--      Here the audience is every investor who may see the subject, and
--      whether they may depends on the listing being live, the NDA, the plan
--      and the share token, which are the gates app/api/documents/open owns.
--      None of that is in this row. The only policy expressible from inside
--      it is USING (true), which is the 079 bug returning, and it would also
--      publish every review whose subject_type is 'investor', which nobody
--      browsing has any business reading.
--
--   2. items IS jsonb. What a viewer may see is a subset of the KEYS inside
--      one column: a skipped item can name an internal tool, a vendor, or a
--      person. No grant and no policy can project inside a column. Code has
--      to do it regardless, and once code is doing it, a policy over the
--      other columns buys nothing and leaves a second, weaker path to the
--      same row.
--
--   3. THE GRANT LIST FREEZES. 109 documents it, 112 and 117 each paid for
--      it. A frozen readable-column list on a TRANSPARENCY record is the
--      worst place in the schema for that trap: the next column added is
--      silently absent from the checklist, and a checklist quietly missing a
--      line is precisely the failure a viewer cannot detect. Silence is the
--      wrong failure mode for this table.
--
-- So both tables are RLS on with NO permissive policy, the shape of
-- verification_evidence (111), nda_disclosures (113), round_closures (114),
-- deal_seals (120) and document_downloads (125). The investor-facing
-- checklist is assembled by one server route that names the columns and the
-- jsonb keys it is willing to publish. That is not a workaround for the
-- absence of column policies. It is the only place the question "may THIS
-- viewer see THIS review" can be answered once, beside the gates that already
-- answer it for documents.
--
--
-- WHY A SECOND TABLE, NEXT TO content_reports (083).
--
-- 083 reports CONTENT: a message, a question, an update, and the two entity
-- types as well, under a closed reason menu, filed by a signed-in member.
-- app/api/report returns 401 without a session, and it has to, because its
-- one-open-report-per-person-per-thing rule keys on the reporter. It already
-- has an admin queue reading it.
--
-- What is added here is the party-level incident that a REVIEW answers, and
-- folding it into 083 would cost that table three things at once.
-- 'investigating' widens its status CHECK underneath an admin tab that does
-- not know the value. The terminal-status constraint below would have to be
-- validated against everything 083 has already accepted, and 083 accepts a
-- resolution with no resolver. And the reason has to open up from a menu,
-- because a stranger with no account is not picking from a list the product
-- has already imagined, and that loosening should not reach the moderation
-- queue.
--
-- They overlap on startup and investor, so if they are ever merged, merge
-- forwards: content stays in 083, a claim about a party belongs here, beside
-- the checklist a reviewer will answer it with.
--
-- reports also gets no reporter-scoped SELECT, which 083 does give. There is
-- nobody to grant an anonymous row to, so such a policy would exist for the
-- member-filed rows alone and would still have to be right about the null
-- case, where "reporter_id = auth.uid()" evaluates to null and denies by the
-- accident of three-valued logic rather than by saying so. Confidentiality
-- here is worth stating outright.

-- ── A. The record that a review happened ─────────────────────────────────
create table if not exists public.review_checklists (
  id               uuid primary key default gen_random_uuid(),
  subject_type     text not null check (subject_type in ('startup', 'investor')),
  -- Polymorphic, so no foreign key: a column cannot reference two tables
  -- conditionally. Same shape as verification_cases and trust_signals (111).
  -- The id belongs to the table subject_type names, startups.id or
  -- investors.id, and never profiles.id, which is the trap 125 had to call
  -- out for document_downloads.investor_id.
  subject_id       uuid not null,
  -- Set null, not cascade. An admin leaving does not un-review the company.
  -- A null reviewer means their account is gone, not that nobody looked.
  reviewer_id      uuid references public.profiles(id) on delete set null,
  -- Which list was run. Without it, "we checked eight things" is unreadable a
  -- year later when the list has twelve. Same argument as seal_version (120)
  -- and nda_records.text_version (113).
  checklist_version text not null,
  -- One entry per item, carrying at least its key and whether it passed.
  -- Items that were NOT done stay in here saying so: an absent item and a
  -- failed item are the same thing to a reader who cannot see the list.
  items            jsonb not null,
  outcome          text not null
                     check (outcome in ('approved', 'rejected', 'changes_requested')),
  -- Not shown to the subject and not shown to a viewer. See the header.
  outcome_reason   text,
  reviewed_at      timestamptz not null default now()
);

-- Reviews are kept, not overwritten: the previous verdict is how a reviewer
-- sees that a company has been round this loop before. The index serves the
-- only hot read, the newest review for one subject.
create index if not exists review_checklists_subject_idx
  on public.review_checklists (subject_type, subject_id, reviewed_at desc);

-- No permissive policy: RLS on with none denies every client-key request, and
-- the header says why that beats a policy for a table whose whole purpose is
-- to be read. The viewer's copy is projected by a server route.
alter table public.review_checklists enable row level security;

comment on table public.review_checklists is
  'One completed review of one subject. Shown to viewers through a server route that picks its columns and its jsonb keys; service role only at the database, because outcome_reason and reviewer_id must not travel with the rest.';
comment on column public.review_checklists.items is
  'Every item on the list, including the ones not done. The gaps are the point: an item missing from this reads to a viewer as an item that passed.';
comment on column public.review_checklists.outcome_reason is
  'The reviewer''s private note on a rejection, written for the next reviewer. Never rendered to the subject or to a viewer.';

-- ── B. The incident path ─────────────────────────────────────────────────
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('startup', 'investor')),
  -- Polymorphic for the same reason as above, and read the same way.
  subject_id   uuid not null,
  -- Nullable: a logged-out visitor may report, and the person who can say
  -- "those are not their founders" is often a competitor, an ex-employee or a
  -- journalist with no account here. Set null on delete for the 083 reason:
  -- an account that leaves becomes a record, and a report does not vanish
  -- because its author did. Null therefore means "no account attached",
  -- anonymous and since-deleted alike. It is not disambiguated because a
  -- report is weighed on what it says, not on who sent it.
  reporter_id  uuid references public.profiles(id) on delete set null,
  reason       text not null,
  detail       text,
  status       text not null default 'open'
                 check (status in ('open', 'investigating', 'actioned', 'dismissed')),
  handled_by   uuid references public.profiles(id) on delete set null,
  handled_at   timestamptz,
  created_at   timestamptz not null default now(),
  -- A report that ends carries the name of whoever ended it. Both terminal
  -- states are consequences: 'actioned' is something done to a member, and
  -- 'dismissed' is a decision to do nothing that the member will never get to
  -- appeal. Neither may be reached by a sweep, a retry, or a job. 'open' and
  -- 'investigating' are exempt because triage is not yet a decision.
  constraint reports_terminal_status_needs_a_human check (
    status in ('open', 'investigating') or handled_by is not null
  )
);

create index if not exists reports_queue_idx
  on public.reports (status, created_at desc);
create index if not exists reports_subject_idx
  on public.reports (subject_type, subject_id, created_at desc);

-- No policy at all, INSERT included. An anonymous report cannot be scoped to
-- anyone, so it arrives through a server route that can rate limit it; an
-- insert policy for anon would be a write into the admin queue from a key
-- that ships in the browser bundle.
alter table public.reports enable row level security;

comment on table public.reports is
  'Incident reports about a startup or an investor, filed by anyone including a visitor with no session. Service role only: the subject of a report must never read it, or identify who filed it.';
comment on column public.reports.reason is
  'Free text here, unlike content_reports, because an anonymous reporter is not choosing from a menu the product has already imagined. The route that accepts it decides what it will take.';

-- ── C. What the founder put their name to ────────────────────────────────
--
-- The attestation is the founder affirming their own numbers and their own
-- cap table. The hash is what makes it evidence rather than a ticked box: it
-- is sha256 over the exact bytes that were on screen, so the wording cannot
-- be edited afterwards and the version string alone cannot be relied on.
-- Same reasoning as deal_seals.seal_sha256 (120) and nda_records.text_sha256
-- (113).
--
-- NONE OF THESE ARE IN THE 112 GRANT, and that is deliberate. 109 revoked
-- SELECT on startups and re-granted a fixed column list, so a column not
-- named there is unreadable by a client key. The founder reads their own
-- through get_my_startup(), which is SECURITY DEFINER and exempt. If a
-- "founder has attested" badge is ever wanted, grant founder_attestation_at
-- and founder_attestation_version and nothing else: the IP identifies a
-- person and the hash is only meaningful next to the text it covers.
alter table public.startups
  add column if not exists founder_attestation_at timestamptz,
  add column if not exists founder_attestation_version text,
  -- text and not inet: the address arrives as X-Forwarded-For, which is a
  -- comma separated chain behind a proxy and inet rejects the chain at
  -- insert. Same as deal_seals.ip_address and document_downloads.ip_address.
  add column if not exists founder_attestation_ip text,
  add column if not exists founder_attestation_sha256 text,
  -- The pointer guarantees the review row exists. It does NOT guarantee the
  -- review is about this startup, because subject_id carries no foreign key.
  -- Any route reading through it must still check subject_type and subject_id.
  add column if not exists last_review_id uuid
    references public.review_checklists(id) on delete set null;

comment on column public.startups.founder_attestation_sha256 is
  'sha256 of the exact text the founder attested to. Evidence: a version string proves nothing if the wording is edited without a bump.';

-- ── D. What the investor declared, and what we checked ───────────────────
--
-- Two different kinds of fact sharing a table. investor_status_declared is
-- the member's own assertion about which category they fall into, which
-- governs what may lawfully be shown to them. identity_check_* is our finding
-- about them. Neither is the member's to write directly: see E.
alter table public.profiles
  -- Backfilling every existing row to 'not_declared' is honest here, unlike
  -- the trap 125 recorded for deals.reconciliation_status, where a default of
  -- 'pending' made the whole table look like a queue. Every row that predates
  -- this migration genuinely has not declared, so the backfilled value is
  -- true of it, and there is one way to say "no" rather than two.
  add column if not exists investor_status_declared text not null default 'not_declared'
    check (investor_status_declared in (
      'professional_client', 'semi_professional', 'private_experienced', 'not_declared'
    )),
  add column if not exists investor_declaration_at timestamptz,
  -- No CHECK. The set of acceptable methods is operational and moves with the
  -- provider, and a vocabulary pinned here would make swapping a KYC vendor a
  -- migration. The constrained vocabulary that matters already exists on
  -- verification_evidence.method (111), which is where a check that was
  -- actually performed is recorded; this column is the summary beside the
  -- member.
  add column if not exists identity_check_method text,
  add column if not exists identity_check_at timestamptz,
  add column if not exists last_review_id uuid
    references public.review_checklists(id) on delete set null;

-- profiles is not under a frozen column grant, and profiles_own_read (079)
-- scopes reads to the member's own row, so a member can see what the platform
-- has them down as. That is intended for the same reason 125 left
-- circumvention_strikes readable: a finding nobody can see is a finding nobody
-- can dispute.
comment on column public.profiles.investor_status_declared is
  'The category the member declared for themselves. Recorded by the server that showed them the declaration, not written from the browser, because it decides what may lawfully be shown to them.';

-- ── E. Columns the subject of a record may not write ─────────────────────
--
-- profiles_own (001) is FOR ALL with auth.uid() = id and the owner-update
-- policy on startups is the same shape, so without this a member could write
-- their own identity check and a founder could stamp their own attestation.
-- The fix is a trigger and NOT a revoke: both tables hold table-level grants,
-- and revoking one column converts the grant into a frozen column list, which
-- is the outage in 109 that 112 and 117 paid for again. The body already
-- exists, public.reject_client_column_write() from 125, driven by TG_ARGV so
-- a table joins by naming its own columns. Service-role writes carry no
-- auth.uid() and pass through.
--
-- Separate triggers rather than extending 125's argument lists: a trigger
-- named for the columns it guards stays readable, and 125 keeps meaning what
-- it says on its own.

-- The attestation is the founder's act, but the RECORD of it is not theirs to
-- make. A timestamp and a hash the attesting party can set are worth nothing
-- as evidence, which is why deal_seals (120) is service role end to end. The
-- founder attests through the route that renders the text, hashes it, and
-- writes all four of those columns together. last_review_id is guarded beside
-- them for the converse reason: it points at our verdict, not at their act.
drop trigger if exists startups_attestation_server_only on public.startups;
create trigger startups_attestation_server_only
  before update on public.startups
  for each row execute function public.reject_client_column_write(
    'founder_attestation_at', 'founder_attestation_version',
    'founder_attestation_ip', 'founder_attestation_sha256',
    'last_review_id'
  );

-- The declaration is included on purpose. It reads like the member's own
-- field, but the platform, not the member, carries the consequence of showing
-- an offer to someone in the wrong category, so what has to be provable is
-- that we ASKED and when. A status the browser can PATCH to
-- 'professional_client' with no passage through the declaration screen leaves
-- no evidence that the question was ever put.
drop trigger if exists profiles_review_fields_server_only on public.profiles;
create trigger profiles_review_fields_server_only
  before update on public.profiles
  for each row execute function public.reject_client_column_write(
    'investor_status_declared', 'investor_declaration_at',
    'identity_check_method', 'identity_check_at', 'last_review_id'
  );
