-- 111_trust_and_verification.sql
--
-- Verification today is one admin toggle that writes a badge. That is a
-- claim, not a system: nothing is collected, nothing is checked, nothing
-- expires, and nothing can be re-examined later. This migration lays the
-- model a real trust layer needs.
--
-- THE LADDER (trust_level on a startup or investor):
--   0  unverified  -- an account exists and its email is confirmed
--   1  contactable -- control of the company domain is proven
--   2  identity    -- a real, government-ID-verified human stands behind it
--   3  entity      -- a company register confirms the entity, and that this
--                     person may act for it
--   4  evidenced   -- the money claims are backed: revenue evidence for a
--                     founder, accreditation and funds for an investor
--
-- Each level subsumes the ones below it. The public badge shows the level
-- and the checks it stands on, so "verified" stops being one bit.

-- ── A. Where an entity stands ────────────────────────────────────────────
alter table public.startups
  add column if not exists trust_level smallint not null default 0,
  add column if not exists trust_reviewed_at timestamptz,
  add column if not exists trust_expires_at timestamptz;

alter table public.investors
  add column if not exists trust_level smallint not null default 0,
  add column if not exists trust_reviewed_at timestamptz,
  add column if not exists trust_expires_at timestamptz;

-- Existing manually-verified entities keep their standing at level 2: an
-- admin did look at them, so they are not demoted to zero -- but they are
-- not credited with registry or financial evidence nobody collected.
update public.startups
  set trust_level = 2, trust_reviewed_at = verified_at
  where verified_at is not null and trust_level = 0;
update public.investors
  set trust_level = 2, trust_reviewed_at = verified_at
  where verified_at is not null and trust_level = 0;

-- ── B. A verification case: one application, start to finish ─────────────
create table if not exists public.verification_cases (
  id              uuid primary key default gen_random_uuid(),
  subject_type    text not null check (subject_type in ('startup','investor')),
  subject_id      uuid not null,
  -- The human who submitted it. Cases outlive listings, so this is how a
  -- rejected applicant is recognised when they come back with a new one.
  owner_id        uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'draft'
                    check (status in ('draft','submitted','in_review','needs_more','approved','rejected','expired','revoked')),
  level_requested smallint not null default 2 check (level_requested between 1 and 4),
  level_granted   smallint check (level_granted between 0 and 4),
  -- 0-100, computed from the automated signals below. High means "look
  -- harder", never "reject automatically" -- a machine flags, a human decides.
  risk_score      smallint,
  risk_flags      jsonb not null default '[]'::jsonb,
  reviewer_id     uuid references auth.users(id) on delete set null,
  reviewed_at     timestamptz,
  -- Shown to the applicant. Rejections must say what was wrong.
  decision_note   text,
  -- Verification is perishable: companies change hands and directors resign.
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists verification_cases_subject_idx
  on public.verification_cases (subject_type, subject_id);
create index if not exists verification_cases_queue_idx
  on public.verification_cases (status, created_at desc);
create index if not exists verification_cases_owner_idx
  on public.verification_cases (owner_id);

-- ── C. Evidence: what the decision actually stands on ────────────────────
-- Documents themselves are NEVER stored in this table. A KYC vendor holds
-- the passport scan and returns a reference; manual uploads live in a
-- private bucket and this row holds the path. `detail` carries only the
-- non-identifying summary a reviewer or an auditor needs.
create table if not exists public.verification_evidence (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.verification_cases(id) on delete cascade,
  kind         text not null check (kind in (
                 'email_domain','domain_control','identity_document','liveness',
                 'company_registry','director_authority','bank_account',
                 'accreditation','revenue_proof','fund_proof','reference','other')),
  -- How it was checked, so an auditor can tell a DNS proof from a screenshot.
  method       text not null check (method in (
                 'automated','dns_txt','registry_api','vendor_kyc','vendor_screening',
                 'bank_connection','manual_upload','manual_review')),
  status       text not null default 'pending'
                 check (status in ('pending','passed','failed','expired','skipped')),
  -- The vendor's own id for the check. Auditable without holding the data.
  vendor_ref   text,
  storage_path text,
  detail       jsonb not null default '{}'::jsonb,
  checked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists verification_evidence_case_idx
  on public.verification_evidence (case_id);

-- ── D. Trust signals: the continuous layer ───────────────────────────────
-- Verification is a moment; fraud is a pattern. Velocity, duplicate
-- companies, disposable email domains, device reuse across accounts,
-- impossible metric jumps -- each lands here and feeds the risk score of
-- any case on that subject, plus the admin's watch queue.
create table if not exists public.trust_signals (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('startup','investor','profile')),
  subject_id   uuid not null,
  signal       text not null,
  severity     text not null default 'info' check (severity in ('info','low','medium','high')),
  detail       jsonb not null default '{}'::jsonb,
  -- An admin can retire a signal they have investigated.
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists trust_signals_subject_idx
  on public.trust_signals (subject_type, subject_id, created_at desc);
create index if not exists trust_signals_open_idx
  on public.trust_signals (severity, created_at desc) where resolved_at is null;

-- ── E. RLS: evidence is the most sensitive data on the platform ──────────
alter table public.verification_cases    enable row level security;
alter table public.verification_evidence enable row level security;
alter table public.trust_signals         enable row level security;

-- An applicant may see their own cases -- their status and the reason for a
-- decision. They may not see the risk score or anyone else's case; the
-- score is served through the API, which strips it.
drop policy if exists verification_cases_own on public.verification_cases;
create policy verification_cases_own on public.verification_cases
  for select using (owner_id = auth.uid());

-- Evidence and signals are service-role only. No policy is the policy:
-- reviewers reach them through admin routes that log every read.
-- (RLS enabled with no permissive policy denies every client-key request.)

-- ── F. Column grants, in the spirit of 109 ───────────────────────────────
-- The risk score and flags never leave the service role, even for the owner.
revoke select on table public.verification_cases from anon, authenticated;
grant select (id, subject_type, subject_id, owner_id, status, level_requested,
              level_granted, reviewer_id, reviewed_at, decision_note,
              expires_at, created_at, updated_at)
  on public.verification_cases to authenticated;

comment on table public.verification_cases is
  'One verification application. Evidence hangs off it; the badge follows from it.';
comment on table public.verification_evidence is
  'What a verification decision stands on. Never holds the documents themselves.';
comment on table public.trust_signals is
  'Continuous fraud signals: velocity, duplicates, device reuse, impossible claims.';
