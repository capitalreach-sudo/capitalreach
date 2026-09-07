-- 112_grant_trust_columns.sql
--
-- 109 locked `startups` down with an EXPLICIT column grant list, which means
-- every column added afterwards is unreadable by client keys until it is
-- named here. 111 added three, and they are the public trust badge -- there
-- is nothing confidential about "this company is verified to level 3", and
-- without the grant the badge would silently vanish on any client-bound read.
--
-- The rule this leaves behind: any new PUBLIC column on startups must be
-- added to this grant, and any new PRIVATE one must deliberately not be.

grant select (trust_level, trust_reviewed_at, trust_expires_at)
  on public.startups to anon, authenticated;
