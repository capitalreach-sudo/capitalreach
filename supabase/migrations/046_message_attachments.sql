-- 046: file attachments on messages.
--
-- The single most requested thing in any deal conversation: decks, financial
-- sheets and term drafts were being described in text and sent by email,
-- which moves the conversation off-platform exactly where the success fee
-- gets forgotten. A message may carry at most one attachment; the path points
-- into the private message-attachments bucket (created alongside this
-- migration -- production had NO storage buckets at all until today, so the
-- existing document upload was broken from birth as well).
--
-- Reads go through a signed URL minted by an API route that re-checks thread
-- membership; the bucket is private, so a leaked path alone opens nothing.
alter table messages add column if not exists attachment_path text;
alter table messages add column if not exists attachment_name text;
