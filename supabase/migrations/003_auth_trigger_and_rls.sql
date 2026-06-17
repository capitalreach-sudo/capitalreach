-- ─── Auto-create profile on every new signup ─────────────────────────────────
-- Fires after INSERT on auth.users so a profile row exists immediately,
-- whether the user signed up with email/password OR Google OAuth.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, subscription_tier)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name'
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_user_meta_data->>'role', 'investor'),
    'free'
  )
  ON CONFLICT (id) DO NOTHING; -- idempotent
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop first so this file can be re-run safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Row Level Security for profiles ─────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read all profiles (needed for search, investor cards, etc.)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

-- Users can only update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- The trigger runs as SECURITY DEFINER so it bypasses RLS on INSERT.
-- Authenticated users should NOT be able to insert arbitrary profiles.
-- (Only the trigger and service-role key may do so.)

-- ─── Row Level Security for startups ─────────────────────────────────────────

ALTER TABLE public.startups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active startups visible to all" ON startups;
CREATE POLICY "Active startups visible to all"
  ON startups FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS "Owners can view their own startup" ON startups;
CREATE POLICY "Owners can view their own startup"
  ON startups FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can insert their startup" ON startups;
CREATE POLICY "Owners can insert their startup"
  ON startups FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update their startup" ON startups;
CREATE POLICY "Owners can update their startup"
  ON startups FOR UPDATE
  USING (auth.uid() = owner_id);

-- ─── Row Level Security for investors ────────────────────────────────────────

ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Investors visible to authenticated users" ON investors;
CREATE POLICY "Investors visible to authenticated users"
  ON investors FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Owners can insert investor profile" ON investors;
CREATE POLICY "Owners can insert investor profile"
  ON investors FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update investor profile" ON investors;
CREATE POLICY "Owners can update investor profile"
  ON investors FOR UPDATE
  USING (auth.uid() = owner_id);

-- ─── Row Level Security for messages ─────────────────────────────────────────

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Thread participants can read messages" ON messages;
CREATE POLICY "Thread participants can read messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM message_threads t
      WHERE t.id = thread_id
        AND (t.startup_id IN (
              SELECT id FROM startups WHERE owner_id = auth.uid()
            )
            OR t.investor_id IN (
              SELECT id FROM investors WHERE owner_id = auth.uid()
            ))
    )
  );

DROP POLICY IF EXISTS "Thread participants can insert messages" ON messages;
CREATE POLICY "Thread participants can insert messages"
  ON messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- ─── Row Level Security for message_threads ──────────────────────────────────

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view threads" ON message_threads;
CREATE POLICY "Participants can view threads"
  ON message_threads FOR SELECT
  USING (
    startup_id IN (SELECT id FROM startups WHERE owner_id = auth.uid())
    OR investor_id IN (SELECT id FROM investors WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Anyone can create a thread" ON message_threads;
CREATE POLICY "Anyone can create a thread"
  ON message_threads FOR INSERT
  WITH CHECK (true);
