-- 101: admin alerts stop wearing the fee costume. "Content reported",
-- "Something is failing", complaint filings — operator signals, not
-- invoices. Typed properly they get their own icon and their own tab.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'deal_opened','deal_stage','deal_closed','deal_passed','message','follow_up_due',
  'contract_status','nda_signed','listing_approved','listing_rejected','team_added',
  'tier_changed','search_match','listing_saved','listing_update','doc_request',
  'deal_shared','question_asked','question_answered','verified','fee_due',
  'complaint_update','interest','admin_alert'
]::text[]));
-- Existing mislabeled rows: operator signals move to the new type; real fee
-- notifications (they all name a company and a fee) stay.
update public.notifications set type='admin_alert'
where type='fee_due' and (title like 'Content reported%' or title like 'Something is failing%' or title like 'Complaint filed%');
