-- Founder/company verification badge, mirroring 049's investor verification.
-- Investors carry a real admin-granted verified badge; founders had no
-- equivalent — the cautious investor evaluating a listing got no "identity
-- checked" signal at all. Same shape: timestamp + bare-uuid admin id (a FK
-- would create a second startups->profiles relationship and break embeds;
-- the audit trail lives in admin_actions).
alter table startups add column if not exists verified_at timestamptz;
alter table startups add column if not exists verified_by uuid;
