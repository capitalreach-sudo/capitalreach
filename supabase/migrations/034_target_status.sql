-- The target list becomes a pipeline: each targeted investor carries a
-- CRM state. Default keeps existing rows meaningful (they were all
-- untouched prospects when this shipped).
ALTER TABLE investor_targets
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'to_contact'
  CHECK (status IN ('to_contact', 'contacted', 'replied', 'passed'));
