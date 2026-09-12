-- 128 - a conversation cannot be manufactured from the browser.
--
-- The messaging rule is enforced in the API routes: an offer, its acceptance,
-- and both signatures on the seal, then a thread. Every legitimate write to
-- threads and messages happens there, through the service role. The client
-- key was never supposed to write these tables at all.
--
-- It could. Three separate ways, each an old permissive policy the newer,
-- stricter ones sat beside rather than replaced:
--
--   threads_authenticated_insert     WITH CHECK (auth.uid() IS NOT NULL)
--     Any signed-in user could create a thread naming ANY startup and ANY
--     investor. The pair's own SELECT policies then showed it to both.
--
--   "Thread participants can insert messages" / messages_participant_insert
--     WITH CHECK (sender_id = auth.uid())
--     The name promises a membership test; the expression never looks at the
--     thread. Any signed-in user could write into any thread id.
--
--   messages_not_suspended_insert    WITH CHECK (NOT is_suspended())
--     Written as a permissive policy, and permissive policies OR: on its own
--     it admits an INSERT whose sender_id is SOMEBODY ELSE, since nothing in
--     it mentions the sender. It was plainly meant to be RESTRICTIVE (an AND
--     over the others); as created it was the widest door of the three.
--
-- Together they made the seal gate, the contact masking and the audit trail
-- optional for anyone with devtools open: manufacture a thread, insert the
-- message raw, and the recipient's inbox renders it. The same person could
-- put words in someone else's mouth, which is worse than bypass.
--
-- Verified before writing this: the app contains ZERO client-key inserts into
-- threads, messages or deals (the one client write anywhere is a thread
-- status UPDATE for archiving, which keeps its policy). Every route insert
-- goes through the service role, which RLS does not bind. So the fix is to
-- remove the client's ability to INSERT entirely, not to sharpen the checks:
-- a check can drift out of step with the routes again; an absent grant path
-- cannot.
--
-- deals gets a RESTRICTIVE deny instead of drops: its FOR ALL participant
-- policies double as INSERT checks (a participant could self-insert a deal
-- for their own pair, skipping every route gate: accreditation, the
-- circumvention acknowledgment, round state). Dropping those policies would
-- also cost the pair their reads and updates, which are legitimate. A
-- restrictive policy ANDs into inserts alone and leaves the rest standing.

-- ── threads: client INSERT closed ─────────────────────────────────────────
drop policy if exists "threads_authenticated_insert" on public.threads;
drop policy if exists "threads_participant_insert" on public.threads;

-- ── messages: client INSERT closed ────────────────────────────────────────
drop policy if exists "messages_participant_insert" on public.messages;
drop policy if exists "Thread participants can insert messages" on public.messages;
drop policy if exists "messages_not_suspended_insert" on public.messages;

-- ── deals: client INSERT closed, reads and updates untouched ──────────────
drop policy if exists "deals_not_suspended_insert" on public.deals;
create policy "deals_insert_server_only" on public.deals
  as restrictive for insert to authenticated, anon
  with check (false);

comment on policy "deals_insert_server_only" on public.deals is
  'Deals are created by the API routes (service role) after the gates run. A participant policy that doubles as an INSERT check would let the pair skip those gates from the browser.';
