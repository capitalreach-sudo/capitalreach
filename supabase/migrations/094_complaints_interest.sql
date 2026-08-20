-- 094: complaints (user-filed grievances with a tracked outcome) and
-- interest_signals (a lightweight "I'm interested" on a profile).
--
-- Complaints are NOT content_reports: a report says "this content breaks the
-- rules", a complaint says "something went wrong for ME" — billing, conduct,
-- a dispute, the platform itself. Different lifecycle, different audience.
--
-- RLS follows the house rules (see memory): users get own-row policies only;
-- admin surfaces read through the service role, never through RLS.

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('platform','user_conduct','deal_dispute','billing','data_privacy','other')),
  subject text not null check (char_length(subject) between 3 and 200),
  body text not null check (char_length(body) between 10 and 5000),
  status text not null default 'open' check (status in ('open','in_review','resolved','dismissed')),
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists complaints_opened_by_idx on public.complaints (opened_by, created_at desc);
create index if not exists complaints_status_idx on public.complaints (status, created_at desc);

alter table public.complaints enable row level security;
-- Own rows only. No user UPDATE: the record of what was said must not be
-- editable after the fact; admins act through the service role.
create policy complaints_own_read on public.complaints for select using (opened_by = auth.uid());
create policy complaints_own_insert on public.complaints for insert with check (opened_by = auth.uid());

create table if not exists public.interest_signals (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  from_type text not null check (from_type in ('startup','investor')),
  from_id uuid not null,
  target_type text not null check (target_type in ('startup','investor')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (from_id, target_type, target_id),
  check (from_type <> target_type)
);
create index if not exists interest_signals_target_idx on public.interest_signals (target_type, target_id);

alter table public.interest_signals enable row level security;
-- Sender manages their own signals. The target's owner sees only a COUNT,
-- served by the API through the service role — never the names via RLS.
create policy interest_own_read on public.interest_signals for select using (from_user = auth.uid());
create policy interest_own_insert on public.interest_signals for insert with check (from_user = auth.uid());
create policy interest_own_delete on public.interest_signals for delete using (from_user = auth.uid());
