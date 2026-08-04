-- Make increment_pageview actually feed the pageviews table.
--
-- The original (002) only bumped the startups.pageviews counter; the
-- pageviews table -- which the founder dashboard's "Profile views (30d)"
-- stat and its sparkline read -- had zero rows ever, so the stat was
-- permanently 0 for every founder. The page's rpc call is wrapped in a
-- silent catch, so nothing ever surfaced.
--
-- One row per view. session_id is NOT NULL and the caller passes nothing,
-- so each row gets a synthetic id; daily counts don't need visitor dedup
-- (distinct-investor identity lives in startup_views, a different table).
CREATE OR REPLACE FUNCTION increment_pageview(startup_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE startups SET pageviews = pageviews + 1 WHERE id = increment_pageview.startup_id;
  INSERT INTO pageviews (startup_id, session_id)
  VALUES (increment_pageview.startup_id, gen_random_uuid()::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
