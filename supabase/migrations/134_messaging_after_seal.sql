-- 134 - a conversation is readable only where it is writable.
--
-- A member has Messages only once a deal they are party to is sealed, and only
-- with that deal's counterpart. Admins keep every conversation they are party
-- to. The API routes hold that on every write and the inbox page on what it
-- lists, but the participant SELECT policies on threads and messages (070,
-- plus whatever older generation survives beside them) answer any party of any
-- thread through PostgREST and Realtime:
--
--   a member's own session, no sealed deal:
--     GET /rest/v1/threads?select=id,startup_id,investor_id,recipient_investor_id
--     GET /rest/v1/messages?select=id,body,sender_id,created_at&thread_id=eq.<id>
--     Realtime postgres_changes on messages filtered to that thread id
--
-- every peer thread (founder to founder, investor to investor, co-investor)
-- and every unsealed pair thread the member was ever in, in full.
--
-- RESTRICTIVE, never a rewrite of the permissive policies. A restrictive
-- policy ANDs with every permissive one whatever its name or generation, so
-- drift between staging and production cannot leave a wider door standing.
-- The permissive participant policies still decide who is a party; this
-- decides which of those threads is open to them.
--
-- The admin clause widens nothing: an admin still reads only the threads the
-- permissive policies give them. There is still no admin policy on this
-- schema.
--
-- deals.sealed_at is server-written only (129) and the seal route sets it only
-- when both signatures carry the same hash, so a non-null value is the seal. A
-- grandfathered deal (120) carries sealed_at too, which sealState also counts.
--
-- Team seats count as party (is_startup_member / is_investor_member), matching
-- lib/messaging-access, so a later permissive policy for seats needs no change
-- here.
--
-- SECURITY DEFINER so the check reads threads, deals, profiles and
-- team_members without their own policies. A policy on threads that selects
-- threads through the caller's rights recurses (42P17, 075).
--
-- Client INSERT on both tables is already closed (128); FOR ALL keeps it closed
-- even if a permissive insert policy is ever recreated.

create or replace function public.messaging_thread_open(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'admin'
    )
    or exists (
      select 1
        from public.threads t
        join public.deals d
          on d.startup_id = t.startup_id
         and d.investor_id = t.investor_id
       where t.id = tid
         and t.recipient_startup_id is null
         and t.recipient_investor_id is null
         and d.sealed_at is not null
         and (public.is_startup_member(t.startup_id) or public.is_investor_member(t.investor_id))
    );
$$;

comment on function public.messaging_thread_open(uuid) is
  'True when the caller may use this thread: an admin, or a party (owner or team seat) to the startup/investor pair thread of a sealed deal. Peer and co-investor threads are never open to a member.';

drop policy if exists "threads_open_after_seal" on public.threads;
create policy "threads_open_after_seal" on public.threads
  as restrictive for all to anon, authenticated
  using (public.messaging_thread_open(id))
  with check (public.messaging_thread_open(id));

comment on policy "threads_open_after_seal" on public.threads is
  'Messaging exists only between the parties of a sealed deal. ANDs with the participant policies so an unsealed or peer thread is invisible to a member through PostgREST and Realtime.';

drop policy if exists "messages_open_after_seal" on public.messages;
create policy "messages_open_after_seal" on public.messages
  as restrictive for all to anon, authenticated
  using (public.messaging_thread_open(thread_id))
  with check (public.messaging_thread_open(thread_id));

comment on policy "messages_open_after_seal" on public.messages is
  'Messaging exists only between the parties of a sealed deal. ANDs with the participant policies so a member cannot read, or be pushed over Realtime, a message in a thread the API would refuse them.';
