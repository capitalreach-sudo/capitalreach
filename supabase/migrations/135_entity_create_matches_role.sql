-- 135 - an account creates only its own kind of entity.
--
-- The save routes refuse a create when profiles.role does not match (a
-- founder making an investor profile, an investor making a startup) or when
-- the account holds a team seat on that entity type. They insert through the
-- caller's session, so the database answers the same question: the owner
-- insert policies checked only auth.uid() = owner_id, which let any signed-in
-- account POST a row of the other kind straight to PostgREST.
--
-- RESTRICTIVE, never a rewrite of the permissive policies. Staging and
-- production carry differently named insert and ALL policies (drift), and a
-- restrictive policy ANDs with every one of them whatever its name, so no
-- wider door survives on either database. Admins keep what they can do today.
--
-- Inserts stay on the caller's session rather than moving to the service role,
-- because the founder listing-caps trigger must keep running on them.
--
-- SECURITY DEFINER so the check reads profiles and team_members without their
-- own policies.

create or replace function public.may_create_entity(kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or (
      exists (
        select 1 from public.profiles p
         where p.id = auth.uid()
           and p.role = case kind when 'startup' then 'startup' when 'investor' then 'investor' end
      )
      and not exists (
        select 1 from public.team_members m
         where m.user_id = auth.uid() and m.entity_type = kind
      )
    );
$$;

comment on function public.may_create_entity(text) is
  'True when the caller may create an entity of this kind: an admin, or an account whose role matches the kind and which holds no team seat of that kind.';

drop policy if exists "startups_create_matches_role" on public.startups;
create policy "startups_create_matches_role" on public.startups
  as restrictive for insert to anon, authenticated
  with check (public.may_create_entity('startup'));

drop policy if exists "investors_create_matches_role" on public.investors;
create policy "investors_create_matches_role" on public.investors
  as restrictive for insert to anon, authenticated
  with check (public.may_create_entity('investor'));
