-- 117_message_safety.sql
--
-- Two problems in one place, both living in the chat.
--
-- 1. CIRCUMVENTION. Contact details in a first message are how a pair leaves
--    the platform before there is anything on the record. But the answer is
--    not to ban them forever: a deal cannot close without these people
--    talking directly, and a marketplace that never lets them is one they
--    will leave anyway. So details are withheld UNTIL THE DEAL IS ON THE
--    RECORD, and freely exchanged after. The obligation is captured; the
--    relationship is then theirs.
--
-- 2. SCAMS. The advance-fee approach -- an "investor" asking a founder to pay
--    a retainer, a legal fee, or a deposit before funds release -- is the
--    oldest fraud in venture and the easiest to run on a young platform. It
--    cannot be blocked without blocking real conversation, so it is marked,
--    and the person being asked for money is told what they are looking at.
--
-- The browser reads messages straight from this table, so masking has to
-- happen on write. The original is kept beside it for evidence and revoked
-- from every client key: a founder who is later defrauded needs the real
-- text, and the person who wrote it must not be able to claim it was edited.

alter table public.messages
  add column if not exists body_original text,
  -- Non-identifying summary of what was found: kinds, not values. The client
  -- reads this to render a warning; it must never carry the contact details
  -- the mask exists to withhold.
  add column if not exists safety_flags jsonb;

-- Column grants in the spirit of 109: everything the app needs stays
-- readable, body_original does not. Named explicitly because a grant list
-- freezes -- a column added later is invisible until it is added here.
revoke select on table public.messages from anon, authenticated;
grant select (id, thread_id, sender_id, body, created_at, read_at,
              attachment_path, attachment_name, safety_flags)
  on public.messages to anon, authenticated;

insert into public.platform_config (key, value) values
  -- Withhold contact details until a deal exists for the pair.
  ('message_contact_masking', 'on'),
  -- Mark suspected advance-fee approaches for the recipient.
  ('message_scam_warnings', 'on')
on conflict (key) do nothing;

comment on column public.messages.body_original is
  'The message as written, before contact masking. Evidence. Never readable by a client key.';
