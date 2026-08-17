-- Email unsubscribe. Emails linked /unsubscribe, which did not exist, and the
-- send path ignored the in-app mute preferences entirely. This adds a global
-- opt-out plus a per-user token so the link works without a login (that is
-- the CAN-SPAM / GDPR expectation for one-click unsubscribe).
alter table profiles add column if not exists email_opt_out boolean not null default false;
alter table profiles add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists idx_profiles_unsubscribe_token on profiles(unsubscribe_token);
