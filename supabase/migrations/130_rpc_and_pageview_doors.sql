-- 130 - The last second-front-door surfaces 129 did not reach: RPCs and pageviews.
--
-- 129 closed the tables (reads to authenticated, privileged writes to the
-- service role). The pre-market audit's fourth lens found three doors left
-- open beside them, each reproduced on production with the publishable key:
--
--   RPCs run as their owner (SECURITY DEFINER) and ignore RLS. Three were
--   EXECUTE-granted to anon, so the anon key called them straight past every
--   gate the tables now enforce:
--     rpc/get_trending_startups   -> 200, real active names+slugs (Schokoheini,
--                                    "The baba bank"), the exact identity the
--                                    anonymous surface is built to mask.
--     rpc/get_startup_daily_views -> 200, any founder's 30-day private traffic
--                                    series by startup id (pageviews_owner RLS
--                                    limits that read to the owner; the DEFINER
--                                    function hands it to anyone).
--     rpc/increment_pageview      -> inserts a view for any id, no login, no
--                                    rate limit, and never checked the listing
--                                    was active.
--
--   pageviews writes were unbound: pageviews_insert's WITH CHECK is only
--   auth.uid() IS NOT NULL -- it never ties the row to the caller -- and the
--   table carries the default-wide anon/authenticated INSERT grant. So any
--   member could POST arbitrary pageviews rows directly, forging the momentum
--   badge and a founder's analytics. The app never writes pageviews from a
--   client: the only writer is increment_pageview (DEFINER, so unaffected by
--   any of the revokes below) and the browse/dashboard reads go through the
--   service role.
--
--   deals: 129's deals_record_server_only froze every financial column but not
--   startup_id / investor_id. threads pinned its parties (threads_parties_
--   immutable); deals did not, so a party could repoint a deal onto a third
--   entity while keeping their own side and still satisfy the participant RLS.
--
-- Also here: two anon-open SELECT policies that contradict the members-only +
-- masking model (empty today, standing doors for whatever the pipeline writes).

-- A. DEFINER RPCs stop answering to the anon key ────────────────────────────
-- Dead code in the app (no caller), but the anon key ships in the bundle, so a
-- revoke is what actually closes them. Service role (and any future server
-- caller) is unaffected; it does not go through these grants.
revoke execute on function public.get_trending_startups(integer)   from anon, authenticated, public;
revoke execute on function public.get_startup_daily_views(uuid)     from anon, authenticated, public;

-- B. The view counter: active-only, and not callable by the anon key ─────────
-- The detail page (the sole caller) reaches this only after its own auth gate,
-- as the signed-in viewer, and only for an active listing. Reasserting both in
-- the function itself means a direct call can't count a view for a draft,
-- suspended or non-existent listing. Kept SECURITY DEFINER so it still writes
-- past the pageviews grant revokes below; anon EXECUTE removed so an
-- unauthenticated caller cannot pump the counter at all.
create or replace function public.increment_pageview(startup_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $function$
begin
  -- One statement gates both writes: nothing happens unless the id is a live
  -- listing. A no-op for anything else, silently, which is what the caller's
  -- try/catch already expects.
  if not exists (select 1 from startups s
                 where s.id = increment_pageview.startup_id and s.status = 'active') then
    return;
  end if;
  update startups set pageviews = pageviews + 1 where id = increment_pageview.startup_id;
  insert into pageviews (startup_id, session_id)
  values (increment_pageview.startup_id, gen_random_uuid()::text);
end;
$function$;

revoke execute on function public.increment_pageview(uuid) from anon, public;
-- authenticated keeps EXECUTE: the page calls it as the signed-in viewer.

-- C. pageviews: no client writes at all ──────────────────────────────────────
-- Drop the unbound INSERT policy and take back the default write grants. Reads
-- stay: pageviews_owner still lets a founder read their own rows, and the app's
-- analytics read via the service role regardless. Writes now come only from
-- increment_pageview (DEFINER) and server routes (service role).
drop policy if exists "pageviews_insert" on public.pageviews;
revoke insert, update, delete, truncate, references on public.pageviews from anon, authenticated;

-- D. A deal's parties are fixed, like a thread's ─────────────────────────────
-- Mirror threads_parties_immutable. The financial columns were already frozen
-- by deals_record_server_only; this stops a party repointing the deal onto a
-- third entity (which the participant RLS would otherwise wave through, since
-- the attacker keeps their own side unchanged).
drop trigger if exists deals_parties_immutable on public.deals;
create trigger deals_parties_immutable
  before update on public.deals
  for each row execute function public.reject_client_column_write(
    'startup_id', 'investor_id'
  );

-- E. Two anon-open reads that outlived the members-only decision ─────────────
-- content_translations mirrors entity prose (listing name/tagline/description);
-- USING (true) TO public served the whole cache to the anon key. The app reads
-- it only through the service role (lib/translate.ts), so it needs no client
-- policy at all -- service-role-only, like the signing-evidence tables in 129.
drop policy if exists "content_translations_read" on public.content_translations;

-- Answered public listing Q&A is member content now that the catalogue is
-- members-only; the founder and the asker keep their own rows through the other
-- two policies. Narrow the public-answered read from anon to members.
drop policy if exists "listing_questions_public_answered" on public.listing_questions;
create policy "listing_questions_public_answered" on public.listing_questions
  for select to authenticated
  using (answer is not null and is_private = false);
