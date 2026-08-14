-- 045: when the round closes.
--
-- Urgency is the founder's main lever and the schema had nowhere to state it:
-- a listing could say how much it was raising but never by when. The date is
-- optional -- plenty of rounds are rolling -- and a past date renders as
-- "closing soon" rather than a countdown, because founders forget to update
-- fields and "closed 12 days ago" on a live listing reads as abandonment.
alter table startups add column if not exists round_close_date date;
