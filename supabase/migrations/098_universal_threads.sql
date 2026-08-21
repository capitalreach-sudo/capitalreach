-- 098: threads without a startup anchor. Every pairing can now talk:
-- founder↔investor and founder↔founder existed, investor↔investor only as a
-- co-investor share ABOUT a startup. Dropping the NOT NULL lets two
-- investors talk directly; the CHECK keeps every thread a well-formed pair.
alter table public.threads alter column startup_id drop not null;
alter table public.threads add constraint threads_valid_pair check (
  startup_id is not null
  or (investor_id is not null and recipient_investor_id is not null)
);
