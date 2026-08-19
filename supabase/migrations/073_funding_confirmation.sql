-- 073 — D37: the lifecycle used to end at the invoice. A closed deal is not
-- a funded deal: money still has to move, and both sides need to agree that
-- it did.
--
-- Deliberately NO bank details are stored. Wire instructions are the single
-- most attacked artefact in this flow — a compromised account that edits an
-- IBAN redirects the whole round — so the platform records only that the
-- steps happened, and tells both parties to verify the account out of band.
alter table deals
  add column if not exists funds_sent_at       timestamptz,
  add column if not exists funds_sent_by       uuid references profiles(id) on delete set null,
  add column if not exists funds_received_at   timestamptz,
  add column if not exists funds_received_by   uuid references profiles(id) on delete set null,
  add column if not exists funded_at           timestamptz,
  add column if not exists funding_reference   text;

create index if not exists deals_funded_idx on deals(startup_id, funded_at) where funded_at is not null;
