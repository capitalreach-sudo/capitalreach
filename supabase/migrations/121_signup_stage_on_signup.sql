-- 121 - stamp the pricing stage a member joined in.
--
-- 110 added profiles.signup_stage and the admin pricing-stage route filters on
-- it to grandfather the founding cohort when a stage ends:
--
--   .eq("signup_stage", "founding").eq("role", "startup")
--
-- Nothing ever wrote the column. It has no DEFAULT and no backfill, so every
-- profile carries NULL, that filter matches nobody, and the promise made on
-- the pricing page -- "free for our first 150", price held when the stage
-- ends -- would have quietly applied to no one at the moment it mattered.
--
-- Written by the signup trigger rather than by application code because the
-- profile row is created by the trigger: a route that stamped it afterwards
-- would miss OAuth signups, which never touch our own signup handler.

alter table public.profiles
  add column if not exists signup_stage text;

-- Everybody already here joined during the founding stage, which is true:
-- the platform has never run under another one.
update public.profiles
set signup_stage = 'founding'
where signup_stage is null;

create or replace function public.handle_new_user()
returns trigger as $$
declare
  stage text;
begin
  -- The stage in force right now, read from the same row the pricing page
  -- reads. Falls back to 'founding' rather than NULL: a member with no stage
  -- is invisible to every grandfathering query, which is the failure this
  -- migration exists to fix.
  select coalesce(value, 'founding') into stage
  from public.platform_config where key = 'pricing_stage';

  insert into public.profiles (id, email, full_name, avatar_url, role, subscription_tier, signup_stage)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_user_meta_data->>'role', 'investor'),
    'free',
    coalesce(stage, 'founding')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on column public.profiles.signup_stage is
  'Pricing stage in force when the member joined. Read by the admin pricing-stage route to hold a cohort at its old price.';
