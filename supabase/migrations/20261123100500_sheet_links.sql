-- Sheet index and hyperlinks on plans (docs/sheet-index-links.md). Safe to run more than once.
--
-- * sheets.sheet_number / sheet_title / discipline / tags: the printed sheet number ("E-101"), its title
--   ("FIRST FLOOR POWER PLAN"), discipline ("Electrical") and free tags. The app calls the first two
--   `number` / `title`; the columns avoid those reserved-ish words.
-- * sheet_links: tappable areas on a sheet (relative 0-1 rect) that open another sheet, a job document, a photo
--   or a web page. target is {kind:"sheet",sheetId,x?,y?} | {kind:"document",documentId} | {kind:"photo",photoId}
--   | {kind:"url",url}. auto = found from callout text rather than drawn by hand.
--
-- Everyone on the job reads links; technicians can't create, change or delete them (office work).

alter table public.sheets
  add column if not exists sheet_number text,
  add column if not exists sheet_title text,
  add column if not exists discipline text,
  add column if not exists tags jsonb;

create table if not exists public.sheet_links (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  -- Soft links (no foreign keys): the sheet may sync later.
  sheet_id text not null,
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null default 0,
  h double precision not null default 0,
  target jsonb not null,
  label text,
  auto boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists sheet_links_project_idx on public.sheet_links (project_id);

drop trigger if exists sheet_links_synced_at on public.sheet_links;
create trigger sheet_links_synced_at before insert or update on public.sheet_links
  for each row execute function public.set_synced_at();
create index if not exists sheet_links_synced_at_idx on public.sheet_links (synced_at);

alter table public.sheet_links enable row level security;
drop policy if exists sheet_links_member on public.sheet_links;
drop policy if exists sheet_links_read on public.sheet_links;
drop policy if exists sheet_links_insert on public.sheet_links;
drop policy if exists sheet_links_update on public.sheet_links;
drop policy if exists sheet_links_delete on public.sheet_links;
create policy sheet_links_read on public.sheet_links for select
  using (public.is_project_member(project_id));
create policy sheet_links_insert on public.sheet_links for insert
  with check (public.is_project_member(project_id) and not public.is_tech());
create policy sheet_links_update on public.sheet_links for update
  using (public.is_project_member(project_id) and not public.is_tech())
  with check (public.is_project_member(project_id) and not public.is_tech());
create policy sheet_links_delete on public.sheet_links for delete
  using (public.is_project_member(project_id) and not public.is_tech());

-- Read-only when the company's subscription has lapsed (same guard as the other job tables; see 20261121000000_billing.sql).
do $$
begin
  if to_regprocedure('public.job_write_guard()') is not null then
    drop trigger if exists sheet_links_write_guard on public.sheet_links;
    create trigger sheet_links_write_guard before insert or update on public.sheet_links
      for each row execute function public.job_write_guard();
  end if;
end $$;
