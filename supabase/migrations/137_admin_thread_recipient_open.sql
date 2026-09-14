-- 136 - an admin-authored thread opens for its addressee.
--
-- 134's messaging_thread_open() admitted only sealed-pair threads and
-- unconditionally refused every thread carrying a recipient_* column. That
-- column can only ever be set by an admin: both producers (deals/share and
-- messages/start's investor-investor and founder-founder branches) refuse a
-- non-admin sender before the insert. So a recipient_* thread is staff
-- outreach to a member, not the peer channel the sealed-deal rule withholds,
-- and 134 was hiding the platform's own support messages from the person
-- they were sent to -- the sender (an admin) could read it back in their own
-- inbox, the addressee could not, with nothing on either side signalling
-- that the message never really arrived. lib/messaging-access.ts's
-- threadOpenFor carries the matching TypeScript-side fix; this closes the
-- same gap where a member reads threads and messages directly through
-- PostgREST or Realtime rather than through the app's own queries.
--
-- Only ever admits a recipient_*-tagged thread, and only to a caller who is
-- a member (owner or team seat) of one of its four party columns -- the
-- outreach's addressee, or an admin's own member entity when they read it
-- back as themself rather than through the admin bypass above.

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
    )
    or exists (
      select 1 from public.threads t
       where t.id = tid
         and (t.recipient_startup_id is not null or t.recipient_investor_id is not null)
         and (
           (t.startup_id is not null and public.is_startup_member(t.startup_id))
           or (t.recipient_startup_id is not null and public.is_startup_member(t.recipient_startup_id))
           or (t.investor_id is not null and public.is_investor_member(t.investor_id))
           or (t.recipient_investor_id is not null and public.is_investor_member(t.recipient_investor_id))
         )
    );
$$;

comment on function public.messaging_thread_open(uuid) is
  'True when the caller may use this thread: an admin, a party to a sealed-pair thread, or a party (owner or team seat) named on either side of an admin-authored recipient_* thread.';
