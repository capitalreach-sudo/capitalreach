-- 018: record when a 2% success-fee invoice is actually paid.
--
-- deals already tracks success_fee_invoiced (did we raise the invoice?) but
-- nothing tracked collection. The Stripe webhook now distinguishes success-fee
-- invoices from subscription invoices and stamps this column on invoice.paid,
-- so unpaid fees are visible instead of silently indistinguishable from paid.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS success_fee_paid_at TIMESTAMPTZ;

-- The webhook looks up the deal by the Stripe invoice id, so that lookup needs
-- to be indexed. Partial: the vast majority of deals never get an invoice.
CREATE INDEX IF NOT EXISTS idx_deals_stripe_invoice_id
  ON deals (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;
