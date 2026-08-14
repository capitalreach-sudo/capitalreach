-- 052: per-user thread archiving.
--
-- An inbox with no archive is a to-do list that only grows. Archiving is
-- PER USER: one side filing a conversation away must not hide it from the
-- other, so this is a (thread, user) pair rather than a flag on the thread.
-- A new message does not unarchive -- the unread badge already signals it,
-- and un-filing someone's mail because the counterpart wrote again is the
-- kind of helpfulness that loses things.
--
-- Service-role only (RLS enabled, no policies): the API checks thread
-- membership through the same lib/threads rule as every other message
-- operation.
create table if not exists thread_archives (
  thread_id  uuid not null references threads(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

alter table thread_archives enable row level security;
