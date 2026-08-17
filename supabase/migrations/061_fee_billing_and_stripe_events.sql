-- A11: the close route swallowed a Stripe invoice failure into console.error,
-- and 'unbillable' (no customer) was returned to the client and forgotten. Now
-- every close records what happened to the fee so an admin can see it.
alter table deals add column if not exists fee_billing_status text
  check (fee_billing_status in ('invoiced','no_customer','failed','waived'));
alter table deals add column if not exists fee_billing_error text;

-- A12: Stripe retries on any non-2xx and the handler returned 500 on error, so
-- a partially-applied handler was guaranteed to replay. Record each event id;
-- a duplicate short-circuits to 200.
create table if not exists stripe_events (
  id           text primary key,          -- Stripe event id (evt_...)
  type         text not null,
  received_at  timestamptz not null default now()
);
