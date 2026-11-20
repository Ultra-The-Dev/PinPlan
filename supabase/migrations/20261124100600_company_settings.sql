-- Company settings: the business details every quote, invoice, report and PDF carries (name, phone, email, website,
-- address, logo, standard terms). Kept per company so they follow the company to every device and every person,
-- instead of living in one browser. One row per company, keyed like document_settings by the company owner
-- (my_billing_owner(): the team owner, or the user themselves when they work alone).
--   read:  everyone on the team, technicians too (their reports and forms carry the company name and logo)
--   write: the owner and office admins (not technicians)
-- The apps keep a cache in their own settings; newest updated_at wins (src/lib/companySettings.ts).
-- Safe to run more than once.

create table if not exists public.company_settings (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  business_name text not null default '' check (length(business_name) <= 200),
  phone text not null default '' check (length(phone) <= 60),
  email text not null default '' check (length(email) <= 254),
  website text not null default '' check (length(website) <= 300),
  address text not null default '' check (length(address) <= 500),
  -- Standard terms printed on quotes.
  terms text not null default '' check (length(terms) <= 20000),
  -- The logo: a site path, an https URL or a small uploaded image as a data: URL (the web app shrinks it to 800 px).
  logo text not null default '' check (length(logo) <= 1500000),
  -- An uploaded image (images table / plans bucket) used as the logo, for apps that store it that way. Optional.
  logo_image_id text check (logo_image_id is null or length(logo_image_id) <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table public.company_settings enable row level security;

drop policy if exists company_settings_read on public.company_settings;
create policy company_settings_read on public.company_settings for select
  using (owner_id = public.my_billing_owner());
drop policy if exists company_settings_insert on public.company_settings;
create policy company_settings_insert on public.company_settings for insert
  with check (owner_id = public.my_billing_owner() and not public.is_tech());
drop policy if exists company_settings_update on public.company_settings;
create policy company_settings_update on public.company_settings for update
  using (owner_id = public.my_billing_owner() and not public.is_tech())
  with check (owner_id = public.my_billing_owner() and not public.is_tech());
-- No delete policy: the row goes with the owner's account (on delete cascade).

-- Who changed it last is the database's to say.
create or replace function public.company_settings_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then new.updated_by := auth.uid(); end if;
  return new;
end $$;

drop trigger if exists company_settings_stamp on public.company_settings;
create trigger company_settings_stamp before insert or update on public.company_settings
  for each row execute function public.company_settings_stamp();

revoke all on public.company_settings from anon;
grant select, insert, update on public.company_settings to authenticated;
