-- 109_entitlement_lockdown.sql
-- The audit's headline finding: RLS row policies let anonymous PostgREST read
-- EVERY column of startups (all 103 listings' MRR/ARR/valuations), the full
-- startup_founders table (unmasked names + LinkedIn -- the exact
-- circumvention vector identity masking exists to remove), and
-- startup_documents. The app-layer strip was decorative. This migration
-- moves the paywall into the database.

-- A. startups: financial columns leave the anon/authenticated surface
--    entirely (column-level grants). Entitled surfaces read via the service
--    role, which is exempt from grants; the owner's edit form uses the RPC
--    below. Public browse columns stay readable so nothing else changes.
revoke select on table public.startups from anon, authenticated;
grant select (id, owner_id, slug, name, website, tagline, description, problem, solution, market, competitive_advantage, stage, industry, country, funding_target, equity_offered, min_check_size, use_of_funds, status, subscription_tier, vaultrise_score, pageviews, featured, require_nda, demo_video_url, created_at, updated_at, founded_date, city, business_model, revenue_model, team_size, company_type, pitch_deck_url, product_hunt_url, twitter_url, competitors_json, target_markets, languages, previous_funding, lead_investor, deck_language, video_pitch_url, social_proof, looking_for, booking_url, lead_investor_status, founded_year, tags, languages_spoken, search_vector, round_close_date, verified_at, verified_by, listed_at, edited_since_review_at, round_state, round_state_changed_at, show_momentum, valuation_type, instrument, safe_cap, safe_discount, draft_nudged_at, draft_nudge_count, logo_url, logo_color, scored_at, is_demo, verification_checks) on public.startups to anon, authenticated;

-- B. The owner's own full row, for the edit form (browser client).
--    SECURITY DEFINER is exempt from the column grants; the WHERE clause is
--    the authorization.
create or replace function public.get_my_startup()
returns setof public.startups
language sql security definer set search_path = public as $fn$
  select * from public.startups
  where owner_id = auth.uid()
  order by status asc, created_at asc;
$fn$;
revoke all on function public.get_my_startup() from public, anon;
grant execute on function public.get_my_startup() to authenticated;

-- C. Founder identities and document metadata: owner-only at the row level.
--    (Server surfaces render them via the service role after masking/gating;
--    the owner keeps managing their own via the existing _owner policies.)
drop policy if exists founders_public on public.startup_founders;
drop policy if exists documents_public on public.startup_documents;

-- D. Founder tier caps the browser could previously write around (the edit
--    form updates startups through RLS): NDA gating, demo video, and the
--    listing limit are now enforced in the database. Service-role writes
--    (admin, cron, seeds) have no auth.uid() and pass through; launch mode
--    lifts the founder paywalls exactly as the app layer does.
create or replace function public.enforce_founder_listing_caps()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare tier text; n int; launch boolean;
begin
  if auth.uid() is null then return new; end if;
  if new.owner_id is distinct from auth.uid() then return new; end if;
  select coalesce(value, 'false') = 'true' into launch
    from public.platform_config where key = 'launch_mode';
  if coalesce(launch, false) then return new; end if;
  select coalesce(subscription_tier, 'free') into tier
    from public.profiles where id = auth.uid();
  if tier not in ('starter','listed','pro','premium','growth') then
    if coalesce(new.require_nda, false)
       and (tg_op = 'INSERT' or coalesce(old.require_nda, false) is distinct from coalesce(new.require_nda, false)) then
      raise exception 'NDA gating requires a paid plan';
    end if;
    if new.demo_video_url is not null and new.demo_video_url <> ''
       and (tg_op = 'INSERT' or old.demo_video_url is distinct from new.demo_video_url) then
      raise exception 'Demo video requires a paid plan';
    end if;
  end if;
  if tg_op = 'INSERT' and tier <> 'growth' then
    select count(*) into n from public.startups where owner_id = new.owner_id;
    if n >= 1 then
      raise exception 'Listing limit reached for the current plan';
    end if;
  end if;
  return new;
end $fn$;
drop trigger if exists startups_founder_caps on public.startups;
create trigger startups_founder_caps
  before insert or update on public.startups
  for each row execute function public.enforce_founder_listing_caps();
