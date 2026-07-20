-- Fix messaging: ensure threads/messages RLS is correct (idempotent, safe to
-- re-run regardless of whether migration 003 or 000_combined ran previously),
-- and add both tables to the realtime publication so postgres_changes
-- subscriptions in the dashboard inbox actually receive INSERT events.

ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view threads" ON threads;
CREATE POLICY "Participants can view threads"
  ON threads FOR SELECT
  USING (
    startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
    OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Anyone can create a thread" ON threads;
CREATE POLICY "Anyone can create a thread"
  ON threads FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Participants can update threads" ON threads;
CREATE POLICY "Participants can update threads"
  ON threads FOR UPDATE
  USING (
    startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
    OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
  );

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Thread participants can read messages" ON messages;
CREATE POLICY "Thread participants can read messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM threads t
      WHERE t.id = thread_id
        AND (t.startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
             OR t.investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Thread participants can insert messages" ON messages;
CREATE POLICY "Thread participants can insert messages"
  ON messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Add threads/messages to the realtime publication (idempotent — skips if
-- already present, since ALTER PUBLICATION ... ADD TABLE errors otherwise).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE threads;
  END IF;
END $$;
