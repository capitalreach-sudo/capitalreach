-- 086 — machine translation of listings and investor profiles.
--
-- The interface speaks fifteen languages; the CONTENT speaks whichever one the
-- founder typed it in. A Japanese investor browsing a German round gets a
-- perfectly localised page wrapped around a pitch they cannot read, which is
-- the half of the localisation that actually decides whether they engage.
--
-- Translations are cached per (entity, locale) and keyed by a hash of the
-- source text, so an edit invalidates its own translation rather than leaving
-- a stale one in front of investors — a pitch that says the old numbers in
-- Japanese is worse than one that says nothing.
create table if not exists content_translations (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('startup','investor','update')),
  entity_id    uuid not null,
  locale       text not null,
  -- sha256 of the concatenated source fields. A mismatch means the source
  -- moved on and the row is discarded rather than served.
  source_hash  text not null,
  fields       jsonb not null,
  created_at   timestamptz not null default now(),
  unique (entity_type, entity_id, locale)
);
create index if not exists content_translations_lookup
  on content_translations(entity_type, entity_id, locale, source_hash);

alter table content_translations enable row level security;
-- Translations of published content are as public as the content itself, and
-- the cache is only ever written by the service role behind /api/translate.
drop policy if exists content_translations_read on content_translations;
create policy content_translations_read on content_translations for select using (true);
