-- Add startup-to-startup messaging. Threads were previously always
-- (startup_id, investor_id). This adds an optional recipient_startup_id so a
-- thread can instead be (startup_id = initiator, recipient_startup_id =
-- target), with investor_id left null in that case.

ALTER TABLE threads ALTER COLUMN investor_id DROP NOT NULL;

ALTER TABLE threads ADD COLUMN IF NOT EXISTS recipient_startup_id UUID REFERENCES startups(id) ON DELETE CASCADE;

ALTER TABLE threads DROP CONSTRAINT IF EXISTS threads_exactly_one_recipient;
ALTER TABLE threads ADD CONSTRAINT threads_exactly_one_recipient CHECK (
  (investor_id IS NOT NULL AND recipient_startup_id IS NULL)
  OR (investor_id IS NULL AND recipient_startup_id IS NOT NULL)
);

ALTER TABLE threads DROP CONSTRAINT IF EXISTS threads_no_self_message;
ALTER TABLE threads ADD CONSTRAINT threads_no_self_message CHECK (
  startup_id IS DISTINCT FROM recipient_startup_id
);

-- Existing UNIQUE(startup_id, investor_id) already prevents duplicate
-- investor threads (investor_id NULL doesn't collide, since NULL <> NULL in
-- a unique index). Add the equivalent guard for startup-pair threads.
CREATE UNIQUE INDEX IF NOT EXISTS threads_startup_pair_unique
  ON threads (LEAST(startup_id, recipient_startup_id), GREATEST(startup_id, recipient_startup_id))
  WHERE recipient_startup_id IS NOT NULL;

-- Refresh RLS on threads/messages to also recognize the recipient startup as
-- a participant (idempotent — safe to re-run alongside migration 011).
DROP POLICY IF EXISTS "Participants can view threads" ON threads;
CREATE POLICY "Participants can view threads"
  ON threads FOR SELECT
  USING (
    startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
    OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
    OR recipient_startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
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
    OR recipient_startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Thread participants can read messages" ON messages;
CREATE POLICY "Thread participants can read messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM threads t
      WHERE t.id = thread_id
        AND (t.startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
             OR t.investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
             OR t.recipient_startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid()))
    )
  );
