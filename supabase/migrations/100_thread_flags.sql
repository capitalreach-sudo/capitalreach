-- 100: per-person importance markers on conversations. YOUR star, not the
-- thread's: each participant flags independently, so RLS is a pure own-row
-- policy and the flag can never leak across the table.
create table if not exists public.thread_flags (
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  important boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
alter table public.thread_flags enable row level security;
create policy thread_flags_own on public.thread_flags
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
