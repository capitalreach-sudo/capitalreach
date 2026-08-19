-- 079 — profiles was readable, in full, by every signed-in user.
--
-- The policy was `profiles_read_authenticated USING (true)`: any account that
-- completed signup could page the entire table and read every member's email
-- address, name, role, subscription tier and suspension state. Verified on
-- production before this change — an ordinary demo founder's token returned
-- 207 of 207 rows.
--
-- On a platform whose whole proposition is that an investor's identity is
-- worth a 2% fee, that was the back door around the product. It was also the
-- one thing a GDPR request would find first.
--
-- Every server read of somebody else's profile already goes through the
-- service-role client (audited: the routes read either `.eq("id", auth uid)`
-- or use createAdminClient). The single browser-side reader was the messaging
-- account search, which matched on EMAIL; it now runs server-side against the
-- directories via /api/messages/accounts and never returns an address.
drop policy if exists profiles_read_authenticated on profiles;

create policy profiles_own_read on profiles
  for select to authenticated
  using (auth.uid() = id);
