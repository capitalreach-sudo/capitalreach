-- In-app NDA acceptance (clickwrap). Until now the only way signed_at got
-- written was a DocuSign webhook — and with DocuSign unconfigured the room
-- never opened. These columns record a click-through acceptance so an investor
-- can agree to confidentiality in-app and the data room opens immediately,
-- with a real audit trail. DocuSign remains an optional formal layer on top.

ALTER TABLE nda_records ADD COLUMN IF NOT EXISTS method      TEXT;   -- 'clickwrap' | 'docusign'
ALTER TABLE nda_records ADD COLUMN IF NOT EXISTS nda_version TEXT;   -- which wording was agreed
ALTER TABLE nda_records ADD COLUMN IF NOT EXISTS signed_ip   TEXT;   -- acceptor IP (audit)
ALTER TABLE nda_records ADD COLUMN IF NOT EXISTS signed_ua   TEXT;   -- acceptor user-agent (audit)
