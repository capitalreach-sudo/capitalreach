-- A place to publish a scheduling link (Calendly/Cal.com/...). Both sides:
-- investors book calls with founders and vice versa.
ALTER TABLE investors ADD COLUMN IF NOT EXISTS booking_url text;
ALTER TABLE startups  ADD COLUMN IF NOT EXISTS booking_url text;
