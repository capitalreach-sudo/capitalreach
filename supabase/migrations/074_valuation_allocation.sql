-- 074 — D44 round math, D43 allocation tracking.
--
-- D44: a capital marketplace with no valuation field. Investors could see
-- "raising €500k for 8%" and had to do the arithmetic themselves — and the
-- two numbers can contradict each other, which nothing checked.
alter table startups
  add column if not exists valuation        numeric,
  add column if not exists valuation_type   text check (valuation_type in ('pre','post')),
  add column if not exists instrument       text check (instrument in ('equity','safe','convertible_note')),
  add column if not exists safe_cap         numeric,
  add column if not exists safe_discount    numeric check (safe_discount is null or (safe_discount >= 0 and safe_discount < 100));

-- D43: an investor's deployment plan. Target for the period; committed and
-- deployed are derived from deals, never stored twice.
alter table investors
  add column if not exists allocation_target numeric,
  add column if not exists allocation_period text;
