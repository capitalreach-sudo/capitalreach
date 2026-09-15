-- 141 - richer startup and investor profiles.
--
-- Reconciled against the actual live schema before writing this, not the
-- spec's raw field list: startups already carries tam/sam/som (numeric),
-- tagline, description, competitive_advantage, market, competitors_json,
-- use_of_funds, demo_video_url; investors already carries min_check/
-- max_check, investment_thesis, bio, portfolio_json, number_of_investments,
-- lead_rounds, geography, industries, stages, website, languages. Every one
-- of those already serves the role the spec's differently-named field
-- would have duplicated (elevator_pitch->tagline, long_description->
-- description, unfair_advantage->competitive_advantage, market_description
-- ->market, competitors->competitors_json, thesis_long->investment_thesis,
-- bio_long->bio, check_size_min/max->min_check/max_check, sectors->
-- industries, geographies->geography, website_url->website, portfolio->
-- portfolio_json, portfolio_count->number_of_investments, leads_rounds->
-- lead_rounds). Adding twins under the spec's names would have left two
-- overlapping free-text fields with no rule for which one the UI reads,
-- forever. Only genuinely new concepts get a new column below.
--
-- lead_investor_status (text, already on startups) is REPURPOSED here as
-- the round's lead-status field ('have_lead' / 'seeking_lead' / 'open') --
-- grepping the app tree found zero reads or writes of it anywhere, so it
-- was dead, and its name already matches the concept exactly.
--
-- No data_room_doc_count column: the room's own table (startup_documents)
-- is the source of truth, and a stored counter drifts the moment a
-- document is added or removed outside whatever code path remembers to
-- bump it. The count is computed at read time instead, the same pattern
-- pageviews and other live counts already use across this app.
--
-- Three more spec fields duplicate existing NORMALIZED tables, not just
-- differently-named columns: revenue_history/user_history -> the existing
-- startup_metrics table (id, startup_id, month, mrr, arr, user_count,
-- paying_customers) already stores exactly this, one row per month, and is
-- already read by TractionChart/ScoreTrend elsewhere in the app; team ->
-- the existing startup_founders table (id, startup_id, name, role,
-- linkedin_url, photo_url, twitter_url, bio) already covers every field
-- except "prev" (previous company), added to that table directly below;
-- milestones -> the existing startup_milestones table (id, startup_id,
-- date, description), already wired into the Startup/StartupMilestone
-- types. A jsonb column sitting next to a normalized table nobody reads it
-- against is worse than not having it.

alter table startups
  add column if not exists why_now text,
  add column if not exists key_metrics jsonb,
  add column if not exists customers jsonb,
  add column if not exists advisors jsonb,
  add column if not exists hiring jsonb,
  add column if not exists round_type text,
  add column if not exists instruments_accepted text[],
  add column if not exists committed_amount numeric,
  add column if not exists use_of_funds_breakdown jsonb,
  add column if not exists press jsonb,
  add column if not exists awards jsonb,
  add column if not exists product_screenshots text[];

comment on column startups.why_now is 'Market-timing narrative, ~600 chars. Rendered only when non-empty.';
comment on column startups.key_metrics is 'Array of {label, value, unit} -- founder-defined custom metrics beyond the fixed MRR/ARR/users columns and beyond startup_metrics fixed month/mrr/arr/user_count/paying_customers shape.';
comment on column startups.customers is 'Array of {name, logo_url, since}. name is optional per row (an NDA-bound logo can still show without it).';
comment on column startups.advisors is 'Array of {name, role, linkedin}. No existing table for this (unlike team, which reuses startup_founders).';
comment on column startups.hiring is 'Array of {role, location} -- open roles, shown as a light hiring strip.';
comment on column startups.round_type is 'Pre-seed / Seed / Series A / etc, free text to match whatever the founder actually calls their round.';
comment on column startups.instruments_accepted is 'Which instruments this founder would accept (SAFE, Equity, Convertible Note, ...), distinct from the single instrument column, which is what the round is actually structured as.';
comment on column startups.committed_amount is 'How much of funding_target is already soft-circled or committed. Round-progress bar reads committed_amount / funding_target.';
comment on column startups.use_of_funds_breakdown is 'Array of {category, pct}, pct summing to 100. Distinct from the existing free-text use_of_funds column, which stays as the prose explanation.';
comment on column startups.press is 'Array of {outlet, title, url, date}.';
comment on column startups.awards is 'Array of {name, year}.';
comment on column startups.product_screenshots is 'Array of image URLs.';
comment on column startups.lead_investor_status is 'REPURPOSED (migration 141): have_lead / seeking_lead / open. Previously unused, zero reads or writes anywhere in the app as of this migration.';

-- The one real gap between startup_founders and the spec's team shape.
alter table startup_founders add column if not exists prev text;
comment on column startup_founders.prev is 'Previous notable company or role, shown as a short credibility line under the founder current role.';

alter table investors
  add column if not exists headline text,
  add column if not exists sweet_spot numeric,
  add column if not exists instruments_preferred text[],
  add column if not exists notable_exits jsonb,
  add column if not exists co_investors jsonb,
  add column if not exists value_add text[],
  add column if not exists decision_speed text,
  add column if not exists involvement text,
  add column if not exists total_deployed_band text,
  add column if not exists firm_type text,
  add column if not exists responds_within text;

comment on column investors.headline is 'One line, e.g. Seed-stage B2B SaaS, DACH. The investor-directory equivalent of a startup tagline.';
comment on column investors.sweet_spot is 'Typical single cheque size, distinct from the min_check/max_check range.';
comment on column investors.instruments_preferred is 'Which instruments this investor prefers (SAFE, Equity, Convertible Note, ...).';
comment on column investors.notable_exits is 'Array of {company, outcome}.';
comment on column investors.co_investors is 'Array of {name} -- who they typically syndicate with. Names only, not a foreign key: most co-investors named here are not CapitalReach members.';
comment on column investors.value_add is 'Multi-select: Hiring, GTM, Intros, Technical, ...';
comment on column investors.decision_speed is 'Self-reported: Days / 2 weeks / A month+.';
comment on column investors.involvement is 'Self-reported: Hands-on / Board seat / Passive.';
comment on column investors.total_deployed_band is 'Banded, not exact, deliberately: under 1M / 1-5M / etc. An investor real deployed total is competitively sensitive in a way check-size range is not.';
comment on column investors.firm_type is 'e.g. Angel / Micro VC / VC / Family Office / Corporate VC -- distinct from the existing type column narrower angel/fund/etc enum used for filtering.';
comment on column investors.responds_within is 'Self-set SLA, e.g. 48 hours. Purely informational, never enforced.';
