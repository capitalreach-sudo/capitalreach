-- Shared, deal-scoped data room. Until now the only documents in a deal were
-- the founder's *listing* docs re-shown one-directionally. This gives both
-- sides a place to upload into the deal itself (term sheets, cap tables,
-- references, signed PDFs), append-only so every upload is a retained version.

CREATE TABLE IF NOT EXISTS deal_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  startup_id    UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  investor_id   UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  uploader_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uploader_side TEXT NOT NULL CHECK (uploader_side IN ('startup','investor')),
  file_path     TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_size     BIGINT,
  mime_type     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_documents_deal ON deal_documents(deal_id);

ALTER TABLE deal_documents ENABLE ROW LEVEL SECURITY;

-- Participants of the deal may read the list. Writes and downloads go through
-- the service role after an explicit participant check in the API.
DROP POLICY IF EXISTS "deal_documents_read" ON deal_documents;
CREATE POLICY "deal_documents_read" ON deal_documents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM startups s WHERE s.id = deal_documents.startup_id AND s.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM investors i WHERE i.id = deal_documents.investor_id AND i.owner_id = auth.uid()
  )
);

-- Private bucket for deal-room files (10 MB, same mime allowlist as message
-- attachments). URLs are only ever handed out as short-lived signed links.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'deal-documents', 'deal-documents', false, 10485760,
  ARRAY[
    'application/pdf','image/png','image/jpeg','image/webp','text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO NOTHING;
