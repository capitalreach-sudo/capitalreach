-- ─── DEAL CURRENCY ───────────────────────────────────────────────────────────
-- Adds a currency to each deal so amounts can be recorded and displayed in the
-- currency the round actually closed in, not just USD. Existing rows default to
-- USD to preserve current behaviour. Idempotent.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

-- Restrict to the set of currencies the app offers (see lib/currency.ts).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_currency_check'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_currency_check
      CHECK (currency IN ('USD','EUR','GBP','CHF','CAD','AUD','JPY','SGD','INR','AED'));
  END IF;
END $$;
