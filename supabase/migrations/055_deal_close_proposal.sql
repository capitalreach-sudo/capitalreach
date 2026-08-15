-- Two-party close confirmation. Closing raises a real 2% invoice against the
-- founder, yet either side could fire it unilaterally with no acceptance step.
-- Now a close is a handshake: one party proposes the final amount, the other
-- confirms it, and only then does the deal close and the invoice go out. These
-- columns hold the pending proposal until it's confirmed (then cleared) or
-- superseded by a counter-proposal.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS close_proposed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS close_proposed_amount   NUMERIC;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS close_proposed_currency TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS close_proposed_at       TIMESTAMPTZ;
