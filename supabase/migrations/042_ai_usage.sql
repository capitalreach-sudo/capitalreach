-- Per-user AI usage log: the daily rate limit that works even where the
-- Upstash limiter is unconfigured (it degrades open by design; this one
-- cannot). One row per successful invocation.
CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_user_action_date
  ON ai_usage(user_id, action, created_at);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only. Users neither read nor write their own
-- usage rows directly; the API is the only door.
