-- 131 - The investor directory read honours is_public, like the UI already does.
--
-- 129 narrowed the investor directory read from public to authenticated, but
-- kept the qual at (is_external = false) -- every on-platform investor, listed
-- or not. The detail page has always done notFound() for a profile that is
-- (!is_public OR is_external) unless the viewer owns it, and its comment says
-- every read path should filter is_public. A member querying /rest/v1/investors
-- with their own JWT bypassed that page and would read an unlisted investor's
-- full row (contact_email, contact_note, aum, portfolio_json, investment_thesis
-- all carry authenticated column grants).
--
-- Latent today: is_public defaults true, investors/save refuses is_public
-- writes, and all 105 on-platform investors are public -- so the unlisted state
-- is not reachable through the product yet. This closes the door before it is.
--
-- The owner and their team keep reading their own row, listed or not, through
-- investors_team_read (is_investor_member(id) -> owner_id = auth.uid() OR a
-- team_members seat). So the directory policy can be the pure public view.
drop policy if exists "investors_members" on public.investors;
create policy "investors_members" on public.investors
  for select to authenticated
  using (is_external = false and is_public = true);
