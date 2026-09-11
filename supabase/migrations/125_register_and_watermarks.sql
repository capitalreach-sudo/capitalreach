-- 125 - checking a close against the public record, and putting a name on a
-- leaked document.
--
-- Everything up to 120 makes the AGREEMENT provable: who was introduced, on
-- what terms, signed by both sides. Two things are still taken on trust.
--
-- 1. THE NUMBER. A closed deal's amount is whatever the pair typed. It is
--    two-sided, so neither can state it alone, but a pair with a shared
--    interest in a smaller fee can agree on a smaller number together and
--    nothing on the platform contradicts them. The instrument they actually
--    signed, and the filing the company makes at its company register weeks
--    later, are two independent accounts of the same round and neither is
--    written by us. So both are recorded beside the deal and compared.
--
-- 2. THE DOCUMENT. document_views records that an investor opened a file. It
--    does not record which COPY was served, so a deck that surfaces at a
--    competitor cannot be traced back to a person. The ledger below pairs
--    each served copy with the watermark stamped into it.
--
-- WHY THE REGISTER COLUMNS ARE INVISIBLE FOR FREE. 109 revoked SELECT on
-- startups from anon and authenticated and re-granted an explicit column
-- list; 112 records the consequence as a trap, because every column added
-- afterwards is unreadable by a client key until it is named in that grant.
-- Here the trap is the mechanism. The three register columns exist to check a
-- filing against a round and are never shown to an investor, so they are
-- deliberately absent from that grant and must stay absent. Do not add them
-- to 112. The founder still reads their own through get_my_startup(), which
-- is SECURITY DEFINER and exempt from column grants.
--
-- WHY TRIGGERS AND NOT GRANTS FOR THE VERDICTS. deals_participant is FOR ALL
-- with a USING clause and no WITH CHECK, so either party to a deal can UPDATE
-- any column of it, and profiles_own_update is the same shape for a member's
-- own row. Left alone, the party being checked would be able to write their
-- own reconciliation verdict, and the member being struck to zero their own
-- strike count. The fix is NOT to revoke those columns: both tables hold
-- table-level grants, and revoking a single column converts the grant into a
-- frozen column list, which is the outage documented in 109 and paid for
-- again in 112 and 117. A trigger has no such edge, and a column it does not
-- yet name fails open and visibly rather than closed and silently.
--
-- WHY A NEW TABLE AND NOT MORE COLUMNS ON document_views. A view and a
-- download have different weight: a view is one person looking, a download is
-- a copy that now exists off this platform and can be forwarded. Watermark
-- columns hung on document_views would be null for every historical row and
-- for every future view, so "watermark is null" would mean both "never
-- downloaded" and "downloaded before we stamped them", which is the one
-- distinction the table exists to make. document_downloads does not exist in
-- production; document_views does, and CREATE TABLE IF NOT EXISTS against a
-- table that already exists succeeds while adding nothing, leaving every
-- route 400ing on columns that were never created.

-- ── A. The public record the founder is checked against ──────────────────
--
-- Never rendered to an investor, by anybody, ever. Identity masking is the
-- product: a legal entity name and a register number are enough to find the
-- founders, the address and the shareholders in a public database in about a
-- minute, which is the circumvention route the whole fee model is built to
-- close. They are collected so a closed round can be matched against what the
-- company itself filed, and they are read by admin review only.
alter table public.startups
  add column if not exists legal_entity_name text,
  add column if not exists register_type text
    check (register_type in ('handelsregister', 'companies_house', 'other')),
  add column if not exists register_number text;

comment on column public.startups.legal_entity_name is
  'The entity as it appears on the public register. Admin review only, never rendered to an investor.';
comment on column public.startups.register_number is
  'Register number used to match a filing against a closed round. Admin review only, never rendered to an investor.';

-- ── B. Strikes ───────────────────────────────────────────────────────────
-- Counted, not enforced here. What a strike costs is a policy decision that
-- belongs in application code where it can be reversed; the column only has
-- to be something the struck member cannot edit.
alter table public.profiles
  add column if not exists circumvention_strikes integer not null default 0;

-- ── C. The two independent accounts of the amount ────────────────────────
alter table public.deals
  -- The signed instrument, uploaded by a party. Writable by them: it is their
  -- document. The number read OUT of it is not.
  add column if not exists instrument_doc_url text,
  add column if not exists instrument_doc_extracted_amount numeric,
  add column if not exists reconciliation_status text not null default 'pending'
    check (reconciliation_status in ('pending', 'matched', 'mismatch', 'admin_cleared')),
  -- Filings lag the close by weeks, so the check is scheduled rather than run
  -- at close. A date, not a timestamp: a register publishes on a day.
  add column if not exists register_check_due date,
  add column if not exists register_check_status text not null default 'not_due'
    check (register_check_status in ('not_due', 'due', 'matched', 'discrepancy', 'no_filing_found')),
  add column if not exists register_filed_amount numeric;

-- ADD COLUMN with a DEFAULT fills every existing row, so all historical deals
-- land on 'pending', passed ones included. A queue that selects on this
-- column alone is therefore the entire deals table. Filter on there being
-- something to reconcile against, instrument_doc_url is not null, and let
-- 'pending' mean "no verdict yet" rather than "awaiting review".
comment on column public.deals.reconciliation_status is
  'Whether the signed instrument agrees with the amount the pair recorded. pending is the absence of a verdict, not a queue position: every deal predating 125 carries it.';
comment on column public.deals.instrument_doc_extracted_amount is
  'The figure read out of the uploaded instrument by us. Server-written, so a mismatch is not self-certified.';
comment on column public.deals.register_filed_amount is
  'What the company itself filed at its register. An account of the round that we did not write and neither party controls.';

-- Immutable predicate, unlike introductions_tail_idx in 113 where now() ruled
-- a partial index out. The sweep can select straight off the index.
create index if not exists deals_register_check_due_idx
  on public.deals (register_check_due)
  where register_check_status = 'due';

-- ── D. Which copy went to whom ───────────────────────────────────────────
create table if not exists public.document_downloads (
  id           uuid primary key default gen_random_uuid(),
  -- Set null, not cascade. A founder tidying up their data room must not be
  -- able to erase the record of who holds a copy of what they removed, and
  -- the copy outlives the row either way.
  document_id  uuid references public.startup_documents(id) on delete set null,
  startup_id   uuid not null references public.startups(id) on delete cascade,
  investor_id  uuid not null references public.investors(id) on delete cascade,
  -- The stamp burned into the copy that was served. Unique because that is
  -- the only property that makes the ledger answer its one question: a file
  -- turns up somewhere it should not, and this resolves to exactly one
  -- download. A watermark reused across downloads names a set of people,
  -- which is the same as naming nobody. Callers must mint a fresh id per row.
  watermark_id text not null,
  downloaded_at timestamptz not null default now(),
  -- text and not inet: the address arrives as an X-Forwarded-For header,
  -- which is a comma separated chain when a proxy is in front, and inet
  -- rejects the chain at insert time. Same shape as deal_seals.ip_address.
  ip_address   text,
  unique (watermark_id)
);

create index if not exists document_downloads_doc_idx
  on public.document_downloads (document_id, downloaded_at desc);
create index if not exists document_downloads_investor_idx
  on public.document_downloads (investor_id, downloaded_at desc);

alter table public.document_downloads enable row level security;
-- No permissive policy, the same shape as verification_evidence (111),
-- nda_disclosures (113), round_closures (114) and deal_seals (120). RLS on
-- with no policy denies every client-key request, and that is the only thing
-- that satisfies both halves of the requirement at once. A founder does need
-- to see who downloaded their own documents, but a row carries an investor's
-- id beside their IP address, and a policy grants ROWS, not columns: a
-- founder-scoped SELECT would hand every founder the raw IP of every investor
-- who ever opened one of their files. The founder reads this through a route
-- that joins to the documents they own and projects the ledger down to who
-- and when. An investor never reads it at all.
--
-- The missing INSERT policy is deliberate too, and is why this differs from
-- document_views, which lets an investor log their own view from the browser.
-- ip_address cannot be taken from a client, so the row has to be written by
-- the server that served the file and stamped the copy.

comment on table public.document_downloads is
  'One row per watermarked copy served. Resolves a leaked file back to the person who downloaded it. Service role only; it holds an investor identity next to an IP address.';
comment on column public.document_downloads.watermark_id is
  'The stamp in the served copy. Unique: a reused stamp names a set of people, which traces nothing.';

-- ── E. Columns a party to the record may not write ───────────────────────
--
-- One body driven by TG_ARGV, so a table joins by naming its own columns
-- rather than getting its own copy of this, the same way 123 does contact
-- rejection. Guards UPDATE only: these columns have no meaningful value at
-- INSERT, and guarding INSERT would put this in the path of signup, which
-- creates profiles through a SECURITY DEFINER trigger.
create or replace function public.reject_client_column_write()
returns trigger
language plpgsql
-- Pinned for the same reason 123 pins its own: this is INVOKER and does not
-- need it, but the next person to copy the file may not check.
set search_path = pg_catalog, public
as $$
declare
  col    text;
  was    text;
  is_now text;
begin
  -- The service role carries no auth.uid(), and neither do cron jobs or
  -- seeds. Every verdict below is written from there, after the caller has
  -- been authenticated in application code.
  if auth.uid() is null then
    return new;
  end if;

  foreach col in array tg_argv loop
    execute format('select ($1).%I::text, ($2).%I::text', col, col)
      into was, is_now using old, new;
    if was is distinct from is_now then
      raise exception
        '% is set by CapitalReach, not by a party to the record.', col
        using errcode = 'insufficient_privilege';
    end if;
  end loop;

  return new;
end;
$$;

comment on function public.reject_client_column_write() is
  'Rejects a client-key UPDATE that changes any column named in TG_ARGV. Service-role writes pass through.';

-- deals_participant is FOR ALL USING with no WITH CHECK, so without this a
-- founder could mark their own under-reported round matched. instrument_doc_url
-- is absent on purpose: uploading the instrument is the party's own act.
drop trigger if exists deals_verdicts_server_only on public.deals;
create trigger deals_verdicts_server_only
  before update on public.deals
  for each row execute function public.reject_client_column_write(
    'instrument_doc_extracted_amount', 'reconciliation_status',
    'register_check_due', 'register_check_status', 'register_filed_amount'
  );

-- The member can read their own count through profiles_own_read (079), which
-- is intended: a strike nobody can see is a strike nobody can dispute. They
-- cannot write it.
drop trigger if exists profiles_strikes_server_only on public.profiles;
create trigger profiles_strikes_server_only
  before update on public.profiles
  for each row execute function public.reject_client_column_write(
    'circumvention_strikes'
  );
