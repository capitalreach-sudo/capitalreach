-- Helper function: increment startup pageview counter atomically
CREATE OR REPLACE FUNCTION increment_pageview(startup_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE startups SET pageviews = pageviews + 1 WHERE id = startup_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION increment_pageview(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_pageview(UUID) TO anon;

-- Helper: get trending startups (most pageviews in last 7 days)
CREATE OR REPLACE FUNCTION get_trending_startups(limit_count INTEGER DEFAULT 6)
RETURNS TABLE(
  id UUID,
  slug TEXT,
  name TEXT,
  tagline TEXT,
  industry TEXT,
  stage TEXT,
  recent_views BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.slug, s.name, s.tagline, s.industry, s.stage,
    COUNT(pv.id) AS recent_views
  FROM startups s
  LEFT JOIN pageviews pv ON pv.startup_id = s.id
    AND pv.created_at >= NOW() - INTERVAL '7 days'
  WHERE s.status = 'active'
  GROUP BY s.id
  ORDER BY recent_views DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_trending_startups(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_trending_startups(INTEGER) TO anon;

-- Helper: get daily view counts for a startup (last 30 days)
CREATE OR REPLACE FUNCTION get_startup_daily_views(p_startup_id UUID)
RETURNS TABLE(date DATE, views BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(created_at) AS date,
    COUNT(*) AS views
  FROM pageviews
  WHERE startup_id = p_startup_id
    AND created_at >= NOW() - INTERVAL '30 days'
  GROUP BY DATE(created_at)
  ORDER BY date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_startup_daily_views(UUID) TO authenticated;
