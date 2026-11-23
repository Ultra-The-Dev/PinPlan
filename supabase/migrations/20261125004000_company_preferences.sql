-- Company preferences: the rest of a company's setup, so a contractor who signs in on a new device (web, iPhone, iPad)
-- gets all of it back instead of it living in one browser or one phone. Two homes, by who may read them:
--   company_settings.preferences   (everyone on the team, technicians too)
--     branding            tagline, brand and accent colours, service area (the name, logo and terms are columns already)
--     takeoff             wire slack %, drop ft per home run, floor-to-floor height (wire lengths; no prices)
--     checklistTemplates  company checklist templates
--     formTemplates       company form templates
--     installPhotoRequired install statuses that need a proof photo
--     trades              the company's trades, only for someone working alone (a team keeps them on teams.trades)
--   document_settings.preferences  (the office only, like the invoicing settings: prices never reach technicians)
--     pricing             markup %, tax %, labor mode, wire prices per foot, include tentative items, currency
--     billduDocType       what "Send to Billdu" creates
-- Each section is {"value": …, "updatedAt": "<ISO time>"}. A write merges section by section: a section is replaced
-- only by a newer one, and sections a write leaves out stay. So a pricing change on one device never undoes a template
-- change saved on another, and apps that predate this column (they upsert the rows without it) leave it untouched.
-- The rows' own updated_at keeps meaning what it did (the business details / invoicing settings).
-- Read and write rules are the tables' own (read: the team, or the office for document_settings; write: the owner
-- and office admins, never technicians; company_write_guard for lapsed subscriptions). Safe to run more than once.

alter table public.company_settings add column if not exists preferences jsonb not null default '{}'::jsonb;
alter table public.document_settings add column if not exists preferences jsonb not null default '{}'::jsonb;

alter table public.company_settings drop constraint if exists company_settings_preferences_check;
alter table public.company_settings add constraint company_settings_preferences_check
  check (jsonb_typeof(preferences) = 'object' and length(preferences::text) <= 2000000);
alter table public.document_settings drop constraint if exists document_settings_preferences_check;
alter table public.document_settings add constraint document_settings_preferences_check
  check (jsonb_typeof(preferences) = 'object' and length(preferences::text) <= 200000);

-- The time a section was saved, or null when it isn't a section ({"value": …, "updatedAt": "<time>"}).
create or replace function public.preference_section_at(s jsonb) returns timestamptz
language plpgsql immutable set search_path = public as $$
begin
  if s is null or jsonb_typeof(s) <> 'object' or not (s ? 'value') or jsonb_typeof(s -> 'updatedAt') <> 'string' then
    return null;
  end if;
  return (s ->> 'updatedAt')::timestamptz;
exception when others then
  return null;
end $$;

-- `old` with each section of `new` that is newer (or new). Anything in `new` that isn't a section is ignored.
create or replace function public.merge_preferences(old jsonb, new jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  result jsonb := case when jsonb_typeof(old) = 'object' then old else '{}'::jsonb end;
  k text;
  v jsonb;
  at timestamptz;
  prev timestamptz;
begin
  if new is null or jsonb_typeof(new) <> 'object' then return result; end if;
  for k, v in select * from jsonb_each(new) loop
    at := public.preference_section_at(v);
    continue when at is null or length(k) > 60;
    prev := public.preference_section_at(result -> k);
    if prev is null or at > prev then
      result := result || jsonb_build_object(k, jsonb_build_object('value', v -> 'value', 'updatedAt', v -> 'updatedAt'));
    end if;
  end loop;
  return result;
end $$;
revoke all on function public.preference_section_at(jsonb) from public;
revoke all on function public.merge_preferences(jsonb, jsonb) from public;
grant execute on function public.preference_section_at(jsonb) to authenticated, service_role;
grant execute on function public.merge_preferences(jsonb, jsonb) to authenticated, service_role;

create or replace function public.preferences_merge() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.preferences := public.merge_preferences('{}'::jsonb, new.preferences);
  else
    new.preferences := public.merge_preferences(old.preferences, new.preferences);
  end if;
  return new;
end $$;
revoke all on function public.preferences_merge() from public, anon, authenticated;

drop trigger if exists company_settings_preferences on public.company_settings;
create trigger company_settings_preferences before insert or update on public.company_settings
  for each row execute function public.preferences_merge();
drop trigger if exists document_settings_preferences on public.document_settings;
create trigger document_settings_preferences before insert or update on public.document_settings
  for each row execute function public.preferences_merge();

-- ---------- schema version ----------
create or replace function public.schema_version() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v text := '20261125004000_company_preferences';
  recorded text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    begin
      execute 'select version || coalesce(''_'' || name, '''') from supabase_migrations.schema_migrations order by version desc limit 1'
        into recorded;
    exception when others then
      recorded := null;
    end;
    if recorded is not null and left(recorded, 14) > left(v, 14) then v := recorded; end if;
  end if;
  return v;
end $$;
revoke all on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
