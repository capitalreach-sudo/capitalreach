-- 063 — Non-circumvention acknowledgment on the deal timeline.
--
-- The ack itself lives in circumvention_acks (062). The deal's audit trail
-- gets a typed entry so both parties (and an admin exporting the record) see
-- "Non-circumvention acknowledged · <timestamp> · IP <masked>" as the first
-- line of the deal, which is the record that proves the CapitalReach
-- connection date if a fee is ever disputed.
alter table deal_activity drop constraint if exists deal_activity_type_check;
alter table deal_activity add constraint deal_activity_type_check
  check (type in ('note','status_change','contract_status','nda_signed','success_fee','circumvention_acknowledged'));
