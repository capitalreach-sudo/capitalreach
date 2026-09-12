-- 129 - PostgREST stops being a second front door.
--
-- The product's gates -- identity masking for anonymous visitors, the seal
-- before messaging, admin-only stature, fee evidence -- were built in the API
-- routes. The database REST surface answered to older, looser rules, and the
-- pre-market audit walked straight through it with nothing but the publishable
-- key. Reproduced on production before writing this, each restored at once:
--
--   anon key, no session:
--     GET /rest/v1/startups?select=name,tagline,description&status=eq.active
--       -> 200, the entire identity-masked market, named.
--     GET /rest/v1/investors?select=display_name,aum,...&is_external=eq.false
--       -> 200, the investor directory with AUM.
--   a founder's own session, Prefer: return=minimal:
--     PATCH /rest/v1/startups?id=eq.<own>  {"trust_level":3}        -> 204
--                                          {"verified_at":...}      -> 204
--                                          {"subscription_tier":"growth"} 204
--                                          {"featured":true}        -> 204
--                                          {"vaultrise_score":99}   -> 204
--   (An earlier probe with return=representation answered 403 and looked
--   safe; that was only the response SELECT failing. The write went through
--   when nothing asked to read it back.)
--
-- The same class holds for deals: deals_participant is FOR ALL USING with no
-- WITH CHECK, and the fee and seal columns are writable by the pair the
-- record exists to bind. 125 guarded the reconciliation verdicts; the fee
-- itself, the seal hash and the closing snapshot were still open.
--
-- TWO INSTRUMENTS, ONE RULE EACH.
--
-- WRITES are closed with triggers, never column revokes: the grants on these
-- tables are the frozen column lists 109 documents, and editing them has
-- produced two outages (112, 117). reject_client_column_write() (125) passes
-- the service role and rejects a client-key UPDATE that CHANGES a named
-- column, so a founder saving their pitch is untouched and a founder saving
-- themselves a verification is refused. Verified before writing: the app has
-- ZERO client-key writes to startups, investors or deals outside API routes.
--
-- READS are closed with policy roles. The row policies said TO public, which
-- includes anon; every anonymous surface that legitimately shows market data
-- (the sector teaser, OG images, the sitemap, platform stats) reads with the
-- service role, verified per file. Anonymous visitors get their data from
-- pages that mask it, never from the table itself.

-- ── A. Stature, plan and score: not self-service ─────────────────────────
drop trigger if exists startups_stature_server_only on public.startups;
create trigger startups_stature_server_only
  before update on public.startups
  for each row execute function public.reject_client_column_write(
    'verified_at', 'verified_by', 'verification_checks',
    'trust_level', 'trust_reviewed_at', 'trust_expires_at',
    'featured', 'vaultrise_score', 'scored_at',
    'subscription_tier', 'status', 'is_demo', 'listed_at'
  );

drop trigger if exists investors_stature_server_only on public.investors;
create trigger investors_stature_server_only
  before update on public.investors
  for each row execute function public.reject_client_column_write(
    'verified_at', 'verified_by', 'verification_checks',
    'trust_level', 'trust_reviewed_at', 'trust_expires_at',
    'subscription_tier', 'is_demo', 'is_external'
  );

-- ── B. The deal record: evidence, not a shared notepad ───────────────────
-- The pair keeps notes, follow-ups and term_sheet_url; what the FEE rests on
-- is server-written only. sealed_at beside the signatures, the snapshot
-- beside the close, the invoice beside the money.
drop trigger if exists deals_record_server_only on public.deals;
create trigger deals_record_server_only
  before update on public.deals
  for each row execute function public.reject_client_column_write(
    'status', 'amount', 'currency', 'closed_at', 'passed_at',
    'sealed_at', 'seal_sha256', 'seal_version', 'closing_snapshot',
    'success_fee_invoiced', 'success_fee_amount', 'success_fee_paid_at',
    'stripe_invoice_id', 'fee_billing_status', 'fee_waived_at',
    'fee_waived_by', 'fee_waive_reason', 'fee_disputed_at',
    'fee_refunded_at', 'fee_refund_amount', 'fee_enforcement',
    'fee_enforced_at', 'funded_at', 'funds_sent_at', 'funds_received_at',
    'close_proposed_by', 'close_proposed_amount', 'close_proposed_at',
    'commitment_type', 'commitment_at', 'circumvention_ack_id'
  );

-- A thread's parties are fixed at creation. The archive toggle writes status
-- and is untouched; rewriting who a conversation belongs to would hand its
-- history to a third party.
drop trigger if exists threads_parties_immutable on public.threads;
create trigger threads_parties_immutable
  before update on public.threads
  for each row execute function public.reject_client_column_write(
    'startup_id', 'investor_id', 'recipient_startup_id', 'recipient_investor_id'
  );

-- ── C. Anonymous reads: the mask is the product ──────────────────────────
-- Same USING, narrower audience. Members may see the market; the anon key
-- sees nothing, because everything anonymous is served by routes that mask.
drop policy if exists "startups_public_active" on public.startups;
-- Staging drifted: an older generation of the same policy survived there
-- under its original prose name. Dropped by name on both, harmless where
-- absent, so the two databases stop answering differently.
drop policy if exists "Active startups visible to all" on public.startups;
drop policy if exists "startups_active_members" on public.startups;
create policy "startups_active_members" on public.startups
  for select to authenticated
  using (status = 'active');

drop policy if exists "investors_public" on public.investors;
drop policy if exists "Public investors are viewable" on public.investors;
drop policy if exists "investors_members" on public.investors;
create policy "investors_members" on public.investors
  for select to authenticated
  using (is_external = false);

drop policy if exists "startup_updates_read" on public.startup_updates;
drop policy if exists "startup_updates_members" on public.startup_updates;
create policy "startup_updates_members" on public.startup_updates
  for select to authenticated
  using (
    audience = 'all'
    and exists (select 1 from public.startups s
                where s.id = startup_updates.startup_id and s.status = 'active')
  );

-- ── D. Signing evidence: a party sees their own signature, not the file ──
-- nda_participant was FOR ALL over both parties, which let a founder read
-- every investor's raw signing IP -- the roster route exists precisely to
-- mask that. The investor keeps their own row (the detail page reads their
-- own signed_at with their own key); the founder's view is the roster, which
-- is service-role plus masking. Writes were already service-role in practice
-- (/api/nda/accept); now they are in law.
drop policy if exists "nda_participant" on public.nda_records;
drop policy if exists "nda_records_investor_own" on public.nda_records;
create policy "nda_records_investor_own" on public.nda_records
  for select to authenticated
  using (investor_id in (select id from public.investors where owner_id = auth.uid()));

-- Contract signatures carry name + IP + hash; the page that shows them reads
-- with the service role after its own party check. No client policy remains.
drop policy if exists "contract_signatures_read" on public.contract_signatures;
