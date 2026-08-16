-- Admin tier comps must survive Stripe webhooks. set-tier wrote subscription_tier
-- directly, and the next customer.subscription.updated event silently
-- overwrote it with whatever Stripe thought — a comped founder was un-comped
-- without anyone noticing. This flag records "an admin set this on purpose";
-- the webhook leaves tier alone while it is true, and clearing it (or a real
-- subscription change via the portal) hands control back to Stripe.
alter table profiles add column if not exists tier_override boolean not null default false;
