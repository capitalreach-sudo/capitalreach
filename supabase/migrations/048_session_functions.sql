-- 048: read and revoke your own auth sessions.
--
-- PostgREST does not expose the auth schema (correctly), so the sessions UI
-- reaches it through two SECURITY DEFINER functions that scope everything to
-- auth.uid(). No service role in the path at all: the user's own client calls
-- these directly, and the functions cannot be pointed at anyone else's
-- sessions because the caller's identity is taken from the JWT, not from an
-- argument.

create or replace function public.my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_seen timestamptz,
  user_agent text,
  ip text,
  aal text
)
language sql
security definer
set search_path = auth, public
as $$
  select
    s.id,
    s.created_at,
    coalesce(s.refreshed_at, s.updated_at) as last_seen,
    s.user_agent,
    host(s.ip) as ip,
    s.aal::text as aal
  from auth.sessions s
  where s.user_id = auth.uid()
  order by coalesce(s.refreshed_at, s.updated_at) desc;
$$;

-- Deleting the row kills the refresh token: the session dies at the latest
-- when its current access token expires and cannot renew. Revoking your own
-- current session is allowed -- it is simply "sign me out here too".
create or replace function public.revoke_my_session(sid uuid)
returns boolean
language sql
security definer
set search_path = auth, public
as $$
  with gone as (
    delete from auth.sessions
    where id = sid and user_id = auth.uid()
    returning id
  )
  select exists (select 1 from gone);
$$;

revoke execute on function public.my_sessions() from anon, public;
revoke execute on function public.revoke_my_session(uuid) from anon, public;
grant execute on function public.my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
