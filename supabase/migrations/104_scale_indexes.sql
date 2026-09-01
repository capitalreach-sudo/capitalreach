-- 104: indexes from the performance-at-scale audit. Every one closes a
-- confirmed sequential scan on a hot path — the child tables the listing
-- detail page joins on EVERY view were unindexed (4,000+ seq scans, 0 index
-- scans already, at only ~100 listings).

-- The three child tables joined by app/startups/[slug] on every render.
-- Also fixes the unindexed-FK cascade scan on startup delete.
create index if not exists idx_startup_founders_startup   on public.startup_founders   (startup_id);
create index if not exists idx_startup_documents_startup   on public.startup_documents   (startup_id);
create index if not exists idx_startup_milestones_startup  on public.startup_milestones  (startup_id);

-- Browse order (created_at DESC) on active listings was a full scan + sort.
create index if not exists idx_startups_active_created on public.startups (created_at desc) where status = 'active';

-- The per-party deal lists sort by updated_at; the FK indexes cover the
-- filter but not the sort.
create index if not exists idx_deals_startup_updated  on public.deals (startup_id, updated_at desc);
create index if not exists idx_deals_investor_updated on public.deals (investor_id, updated_at desc);

-- email_logs grows with every send and had only its pkey.
create index if not exists idx_email_logs_created on public.email_logs (created_at desc);
