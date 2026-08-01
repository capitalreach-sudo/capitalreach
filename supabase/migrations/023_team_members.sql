-- 023: teams.
--
-- Every entity in this schema is owned by exactly one profile via owner_id, and
-- every policy asks "owner_id = auth.uid()". That models a solo angel fine and
-- models a firm badly: an associate at a fund has no way to see the fund's
-- pipeline, and a co-founder has no way to reach their own listing. One login
-- per company is the practical ceiling on who can use this.
--
-- The approach here is deliberately additive. owner_id stays authoritative and
-- every existing policy keeps working untouched; membership is a second, OR-ed
-- grant. Nothing that could read a row before can stop reading it, which makes
-- this safe to apply to a live database -- the failure mode of a mistake is
-- "the feature doesn't work", not "someone lost access to their own deals".

CREATE TABLE IF NOT EXISTS team_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which kind of entity this membership is on. A single table rather than
  -- startup_members + investor_members because the policies, the invite flow
  -- and the UI are identical for both, and two tables would mean writing all
  -- of it twice.
  entity_type TEXT NOT NULL CHECK (entity_type IN ('startup','investor')),
  entity_id   UUID NOT NULL,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  invited_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One membership per person per entity. Re-inviting updates the role rather
  -- than stacking duplicates.
  UNIQUE (entity_type, entity_id, user_id)
);

-- entity_id is intentionally not a foreign key: it points at startups(id) or
-- investors(id) depending on entity_type, which Postgres cannot express as one
-- FK. Deletion is handled by the triggers below rather than by ON DELETE.
CREATE INDEX IF NOT EXISTS idx_team_members_user
  ON team_members (user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_entity
  ON team_members (entity_type, entity_id);

-- Replaces the missing FK: drop memberships when the entity they point at goes.
CREATE OR REPLACE FUNCTION drop_memberships_for_startup() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM team_members WHERE entity_type = 'startup' AND entity_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION drop_memberships_for_investor() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM team_members WHERE entity_type = 'investor' AND entity_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_drop_memberships_startup ON startups;
CREATE TRIGGER trg_drop_memberships_startup
  BEFORE DELETE ON startups
  FOR EACH ROW EXECUTE FUNCTION drop_memberships_for_startup();

DROP TRIGGER IF EXISTS trg_drop_memberships_investor ON investors;
CREATE TRIGGER trg_drop_memberships_investor
  BEFORE DELETE ON investors
  FOR EACH ROW EXECUTE FUNCTION drop_memberships_for_investor();

-- ── Membership helpers ──────────────────────────────────────────────────────
-- SECURITY DEFINER so they can read team_members from inside a policy on
-- another table without that policy needing its own grant, and STABLE so the
-- planner can call them once per statement rather than once per row.

CREATE OR REPLACE FUNCTION is_startup_member(sid UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM startups s WHERE s.id = sid AND s.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM team_members m
     WHERE m.entity_type = 'startup' AND m.entity_id = sid AND m.user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_investor_member(iid UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM investors i WHERE i.id = iid AND i.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM team_members m
     WHERE m.entity_type = 'investor' AND m.entity_id = iid AND m.user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── RLS on team_members itself ──────────────────────────────────────────────
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- You can see the roster of any team you belong to, and your own memberships.
DROP POLICY IF EXISTS "team_members_visible" ON team_members;
CREATE POLICY "team_members_visible" ON team_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (entity_type = 'startup'  AND is_startup_member(entity_id))
    OR (entity_type = 'investor' AND is_investor_member(entity_id))
  );

-- Writes go through the API on the service role, which checks that the caller
-- owns the entity. No insert/update policy for `authenticated`: a member being
-- able to add members is how a "member" quietly becomes an owner.
DROP POLICY IF EXISTS "team_members_leave" ON team_members;
CREATE POLICY "team_members_leave" ON team_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── Additive membership grants on the entities themselves ───────────────────
-- Each of these sits ALONGSIDE the existing owner policy. Permissive policies
-- are OR-ed, so these only ever widen access -- an owner's own policy is
-- untouched and cannot be broken by anything here.

DROP POLICY IF EXISTS "startups_team_read" ON startups;
CREATE POLICY "startups_team_read" ON startups
  FOR SELECT TO authenticated USING (is_startup_member(id));

DROP POLICY IF EXISTS "startups_team_update" ON startups;
CREATE POLICY "startups_team_update" ON startups
  FOR UPDATE TO authenticated USING (is_startup_member(id)) WITH CHECK (is_startup_member(id));

DROP POLICY IF EXISTS "investors_team_read" ON investors;
CREATE POLICY "investors_team_read" ON investors
  FOR SELECT TO authenticated USING (is_investor_member(id));

DROP POLICY IF EXISTS "investors_team_update" ON investors;
CREATE POLICY "investors_team_update" ON investors
  FOR UPDATE TO authenticated USING (is_investor_member(id)) WITH CHECK (is_investor_member(id));

-- Deals: a firm's associate should see the firm's pipeline.
DROP POLICY IF EXISTS "deals_team" ON deals;
CREATE POLICY "deals_team" ON deals
  FOR ALL TO authenticated
  USING (is_startup_member(startup_id) OR is_investor_member(investor_id))
  WITH CHECK (is_startup_member(startup_id) OR is_investor_member(investor_id));

DROP POLICY IF EXISTS "deal_activity_team" ON deal_activity;
CREATE POLICY "deal_activity_team" ON deal_activity
  FOR ALL TO authenticated
  USING (is_startup_member(startup_id) OR is_investor_member(investor_id))
  WITH CHECK (is_startup_member(startup_id) OR is_investor_member(investor_id));

DROP POLICY IF EXISTS "contracts_team" ON contracts;
CREATE POLICY "contracts_team" ON contracts
  FOR ALL TO authenticated
  USING (is_startup_member(startup_id) OR is_investor_member(investor_id))
  WITH CHECK (is_startup_member(startup_id) OR is_investor_member(investor_id));

DROP POLICY IF EXISTS "watchlists_team" ON watchlists;
CREATE POLICY "watchlists_team" ON watchlists
  FOR ALL TO authenticated
  USING (is_investor_member(investor_id))
  WITH CHECK (is_investor_member(investor_id));

-- Suspension still wins. These are RESTRICTIVE so they AND with everything
-- above rather than sitting beside it -- the mistake that made 017's first
-- version decorative.
DROP POLICY IF EXISTS "team_members_not_suspended" ON team_members;
CREATE POLICY "team_members_not_suspended" ON team_members
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT is_suspended());
