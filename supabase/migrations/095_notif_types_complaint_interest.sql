-- 095: two new notification types. 'complaint_update' tells a filer their
-- complaint moved; 'interest' tells a profile owner someone signalled
-- interest. Reusing existing types here (as reports once did with fee_due)
-- makes the bell's tab filters lie about what a notification is.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'deal_opened','deal_stage','deal_closed','deal_passed','message','follow_up_due',
  'contract_status','nda_signed','listing_approved','listing_rejected','team_added',
  'tier_changed','search_match','listing_saved','listing_update','doc_request',
  'deal_shared','question_asked','question_answered','verified','fee_due',
  'complaint_update','interest'
]::text[]));
