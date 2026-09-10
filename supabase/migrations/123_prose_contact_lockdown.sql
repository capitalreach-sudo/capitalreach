-- 123 - contact details cannot be published, whatever writes them.
--
-- lib/message-safety.ts masks a listing's prose on the way in, and every save
-- route calls it. That binds the UI and nothing else. `authenticated` holds
-- UPDATE on every column of startups, investors, startup_founders and
-- startup_milestones, and the owner-update policies let a row's owner write
-- any of them, so a founder with devtools open could call
--
--   supabase.from("startups").update({ description: "mail me at x@y.com" })
--
-- and publish it to every investor who opens the page. That makes
-- offer-before-contact optional for anyone who notices, which is the whole
-- fee model.
--
-- WHY A TRIGGER AND NOT A REVOKE. The obvious fix is to revoke UPDATE on the
-- prose columns and route writes through a SECURITY DEFINER function. All four
-- tables currently hold TABLE-level grants, and revoking a single column
-- converts the grant into a column-level list covering the others -- which
-- freezes it. Every column added afterwards is silently unwritable until
-- someone remembers to name it. That trap is documented in 109 and it has
-- already cost two outages in this codebase (112 and 117). A trigger has no
-- such edge: a new prose column simply is not checked until it is added to the
-- list below, which fails open and visibly rather than closed and silently.
--
-- WHY REJECT AND NOT MASK. A trigger that rewrote the text would be editing a
-- founder's own words in the database with no undo, and a regex that is wrong
-- once corrupts a listing permanently. Rejecting is recoverable: the writer is
-- told which field and why, and edits it. The app masks first, so anything
-- coming through the product never reaches this check with a raw detail in it.
--
-- Scanned before enabling: zero rows in production or staging carry an
-- unmasked contact detail in any prose column, so nothing existing is stuck.

create or replace function public.has_unmasked_contact(txt text)
returns boolean
language plpgsql
immutable
parallel safe
-- Pinned. A SECURITY DEFINER function with a searchable path is a known
-- escalation; this one is INVOKER, but the pin costs nothing and the next
-- person to copy this file may not notice the difference.
set search_path = pg_catalog, public
as $$
declare
  candidate text;
  digits    text;
begin
  if txt is null or txt = '' then
    return false;
  end if;

  -- An email address. Unambiguous, and the primary way round the platform.
  if txt ~ '[[:alnum:]._%+-]+@[[:alnum:]-]+\.[[:alpha:]]{2,}' then
    return true;
  end if;

  -- A messaging handle. Named apps only, so an ordinary "@" mention of a
  -- person or a product does not trip it.
  if txt ~* '(telegram|whatsapp|signal|skype|wechat|discord)[^[:alpha:]]{0,24}(@[[:alnum:]._]{3,}|\+?[0-9])'
     or txt ~* 't\.me/[[:alnum:]._]+' then
    return true;
  end if;

  -- A phone number, with the same exclusions the application layer uses. The
  -- trap here is dates and times: "2026-09-15 14:00" carries twelve digits and
  -- is the single most ordinary sentence two people exchange. A colon means a
  -- clock and an ISO or slashed date means a calendar, so both are skipped.
  for candidate in
    select (regexp_matches(txt, '\+?[0-9][0-9 ().-]{7,}[0-9]', 'g'))[1]
  loop
    if candidate ~ ':' then continue; end if;
    if candidate ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}' then continue; end if;
    if candidate ~ '[0-9]{1,2}[/.][0-9]{1,2}[/.][0-9]{2,4}' then continue; end if;
    digits := regexp_replace(candidate, '[^0-9]', '', 'g');
    if length(digits) between 9 and 15 then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

comment on function public.has_unmasked_contact(text) is
  'True when the text carries an email address, a named messaging handle, or a 9 to 15 digit number that is not a date or a time. Mirrors maskContactDetails in lib/message-safety.ts.';

-- One trigger body, driven by TG_ARGV, so a table joins the scheme by naming
-- its own prose columns rather than by getting its own copy of this logic.
create or replace function public.reject_unmasked_contact()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  col  text;
  val  text;
begin
  foreach col in array tg_argv loop
    execute format('select ($1).%I::text', col) into val using new;
    if public.has_unmasked_contact(val) then
      raise exception
        'Contact details cannot be published in %. Remove the email address, phone number or messaging handle. They can be exchanged once a deal is open.',
        col
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists startups_prose_contact on public.startups;
create trigger startups_prose_contact
  before insert or update on public.startups
  for each row execute function public.reject_unmasked_contact(
    'tagline', 'description', 'problem', 'solution', 'market',
    'competitive_advantage', 'use_of_funds'
  );

drop trigger if exists investors_prose_contact on public.investors;
create trigger investors_prose_contact
  before insert or update on public.investors
  for each row execute function public.reject_unmasked_contact(
    'bio', 'investment_thesis'
  );

-- The founder bio is rendered to viewers even when identity is protected, and
-- it is written straight from the browser by the onboarding flow.
drop trigger if exists founders_prose_contact on public.startup_founders;
create trigger founders_prose_contact
  before insert or update on public.startup_founders
  for each row execute function public.reject_unmasked_contact('bio');

drop trigger if exists milestones_prose_contact on public.startup_milestones;
create trigger milestones_prose_contact
  before insert or update on public.startup_milestones
  for each row execute function public.reject_unmasked_contact('description');
