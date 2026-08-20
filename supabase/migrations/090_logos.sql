-- 090 — logos.
--
-- There is no logo field anywhere in the schema: every card on the platform
-- renders two initials in a box, so a hundred companies look like a hundred
-- variations of the same company. This is the single largest visual upgrade
-- available, and it is one column per table plus a bucket.
--
-- logo_color is a dominant colour sampled from the image at upload time (in
-- the browser — no image library server-side). Cards use it as a tint so a
-- listing carries its identity even while the image itself is loading.
alter table startups
  add column if not exists logo_url   text,
  add column if not exists logo_color text check (logo_color ~ '^#[0-9a-fA-F]{6}$');

alter table investors
  add column if not exists logo_url   text,
  add column if not exists logo_color text check (logo_color ~ '^#[0-9a-fA-F]{6}$');

-- A PUBLIC bucket, unlike startup-assets: logos appear on pages served to
-- anonymous visitors and in cached HTML, where a signed URL would expire
-- under the reader. Nothing sensitive lives here by construction — the only
-- writer is the logo route, which accepts raster images only.
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;
