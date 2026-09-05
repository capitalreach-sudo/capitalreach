-- 108 - notifications learn to speak the reader's language.
--
-- Every notification was stored as finished ENGLISH prose, so a German
-- founder's bell rang in English regardless of locale -- the one part of the
-- product i18n never reached. New columns carry the locale KEY and its
-- parameters; the stored title/body remain as the legacy fallback (old rows,
-- and any sender not yet converted, keep working verbatim).
alter table notifications add column if not exists title_key text;
alter table notifications add column if not exists body_key  text;
alter table notifications add column if not exists params    jsonb;
