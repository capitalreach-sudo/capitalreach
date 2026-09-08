-- 115_public_browse_index.sql
--
-- 113 made the listing DETAIL members-only. The index and the sector pages
-- stayed open, which contradicts the rule the owner actually stated: signed
-- out, you get the home page. This is the switch for the catalogue itself.
--
--   open     -- anyone may browse the index and the sector pages
--   members  -- signed-in accounts only
--
-- The cost is real and worth stating in one place: with this at "members"
-- the marketplace is invisible to search engines, because there is nothing
-- left for a crawler to read. The home page, the pricing page and the data
-- centre remain public and carry the whole public face of the product.
-- One row to reverse.
insert into public.platform_config (key, value)
values ('public_browse_index', 'members')
on conflict (key) do nothing;
