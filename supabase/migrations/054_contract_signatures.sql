-- Real in-app e-signatures for contracts. Until now "signed" was a status a
-- participant clicked in a dropdown — nothing was actually signed. A signature
-- here records who signed, the exact name they typed, when, from where, and a
-- SHA-256 hash of the contract content at signing time, so a later edit to the
-- contract can't silently change what was agreed. This is a genuine electronic
-- signature (intent + identity + tamper-evident record); DocuSign remains an
-- optional formal layer.

CREATE TABLE IF NOT EXISTS contract_signatures (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  signer_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signer_name  TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  signed_ip    TEXT,
  signed_ua    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, signer_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_signatures_contract ON contract_signatures(contract_id);

-- Participants of the deal may read the signatures on their own contracts.
-- Writes go through the service role in /api/contracts/sign after an explicit
-- participant check, so no INSERT policy is granted here.
ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contract_signatures_read" ON contract_signatures;
CREATE POLICY "contract_signatures_read" ON contract_signatures FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM contracts c
    JOIN startups s   ON s.id = c.startup_id
    JOIN investors i  ON i.id = c.investor_id
    WHERE c.id = contract_signatures.contract_id
      AND (s.owner_id = auth.uid() OR i.owner_id = auth.uid())
  )
);
