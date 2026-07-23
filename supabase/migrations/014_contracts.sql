-- ─── CONTRACTS ───────────────────────────────────────────────────────────────
-- Contracts (term sheets, SAFEs, notes, NDAs, custom agreements) drafted
-- against a deal in the Deal Portal. Both deal participants can view and
-- manage them. Idempotent.

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  startup_id UUID NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  contract_type TEXT NOT NULL DEFAULT 'term_sheet'
    CHECK (contract_type IN ('term_sheet','safe','convertible_note','nda','custom')),
  amount BIGINT,
  currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (currency IN ('USD','EUR','GBP','CHF','CAD','AUD','JPY','SGD','INR','AED')),
  equity_percent NUMERIC(5,2),
  terms TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','signed','void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contracts_deal_idx     ON contracts(deal_id);
CREATE INDEX IF NOT EXISTS contracts_startup_idx  ON contracts(startup_id);
CREATE INDEX IF NOT EXISTS contracts_investor_idx ON contracts(investor_id);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_participants" ON contracts;
CREATE POLICY "contracts_participants" ON contracts FOR ALL USING (
  EXISTS (SELECT 1 FROM startups s  WHERE s.id = contracts.startup_id  AND s.owner_id = auth.uid())
  OR
  EXISTS (SELECT 1 FROM investors i WHERE i.id = contracts.investor_id AND i.owner_id = auth.uid())
);

DROP TRIGGER IF EXISTS contracts_updated_at ON contracts;
CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
