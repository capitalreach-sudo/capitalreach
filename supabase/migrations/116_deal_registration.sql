-- 116_deal_registration.sql
--
-- The remaining hole in the fee, and the one an honest declaration does not
-- close: two parties meet here, negotiate entirely in messages, and either
-- never record a deal at all or record one understating what actually moved.
--
-- The amount is already two-sided -- a deal closes only when the counterpart
-- confirms the same figure, so neither side can state a number alone. What is
-- missing is anything forcing a deal to EXIST. A pair can talk for months,
-- sign an NDA, empty the data room, and close without a single row that says
-- they were ever transacting.
--
-- So: past the point where a conversation is plainly a negotiation, sending
-- the next message requires the deal to be on the record. Registering is free,
-- one click, and commits nobody to anything -- it exists so that the close,
-- the amount and the fee have something to attach to. Deliberately NOT set at
-- first contact: gating a first hello would kill the product, and a deal
-- record opened before anyone is interested is noise.
insert into public.platform_config (key, value) values
  ('deal_registration', 'on'),
  -- Messages exchanged between the pair before registration is required.
  -- Chosen high enough that browsing conversations and polite passes never
  -- trip it, low enough that a real negotiation cannot finish underneath it.
  ('deal_registration_after_messages', '12'),
  -- Signing an NDA or opening the data room is a stronger signal than volume:
  -- both mean the investor is doing diligence, which is a deal in progress.
  ('deal_registration_after_dataroom', 'true')
on conflict (key) do nothing;
