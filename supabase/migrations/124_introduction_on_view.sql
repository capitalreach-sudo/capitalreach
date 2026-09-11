-- 124 - seeing a company here is how the investor found it.
--
-- introductions is the row a fee claim rests on: it carries first_contact_at,
-- the channel, the terms version in force, and the tail's end date. Until now
-- it was only written when somebody DID something -- sent a message, opened a
-- deal, signed an NDA, asked for the data room.
--
-- That leaves the plainest circumvention uncovered. An investor browses, finds
-- a company, reads its name, googles it and writes to the founder directly.
-- Nothing on this platform records that they were ever shown that company, so
-- a fee claim has to argue from an absence.
--
-- The raw fact was already being logged: app/startups/[slug] writes a
-- startup_views row on every listing an investor opens, and the comment above
-- that insert says it is "the record that proves it for fee purposes". It is
-- not, because nothing reads it as an introduction and it carries no terms
-- version or tail.
--
-- 'listing_view' joins the channel list so the introduction can say how it
-- happened, and be weighed accordingly. It is deliberately the WEAKEST of the
-- channels: a message or a signed NDA is an act by both sides, and a page view
-- is one person looking. A reviewer should read them differently, which is
-- why the channel is recorded rather than flattened.

alter table public.introductions drop constraint if exists introductions_channel_check;
alter table public.introductions add constraint introductions_channel_check
  check (channel = any (array[
    'message', 'deal', 'nda', 'interest', 'data_room', 'introduction_request', 'listing_view'
  ]));

comment on column public.introductions.channel is
  'How the pair met. listing_view is the weakest: one side looked at a page. message, deal, nda and data_room are acts by both.';
