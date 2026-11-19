-- Field documentation (CompanyCam-style): job photos with mark-up, comments, checklists, daily logs,
-- documents, job labels/location, and shareable photo reports. Safe to run more than once.

-- ---------- jobs: labels + location ----------
alter table public.projects add column if not exists labels jsonb;
alter table public.projects add column if not exists lat double precision;
alter table public.projects add column if not exists lng double precision;

-- ---------- photos ----------
create table if not exists public.photos (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  image_id text not null,
  width double precision not null default 0,
  height double precision not null default 0,
  taken_at timestamptz not null default now(),
  taken_by text,
  lat double precision,
  lng double precision,
  caption text,
  tags jsonb,
  annotations jsonb,
  -- Soft links (no foreign keys): the device, sheet, before-photo or checklist item may sync later.
  marker_id text,
  sheet_id text,
  room text,
  before_id text,
  checklist_id text,
  checklist_item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists photos_project_idx on public.photos (project_id);

create table if not exists public.photo_comments (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  photo_id text not null,
  author text,
  text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists photo_comments_project_idx on public.photo_comments (project_id);

-- ---------- checklists ----------
create table if not exists public.checklists (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  name text not null default '',
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists checklists_project_idx on public.checklists (project_id);

-- ---------- daily logs ----------
create table if not exists public.job_logs (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  log_date date not null default current_date,
  title text,
  body text not null default '',
  author text,
  photo_ids jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists job_logs_project_idx on public.job_logs (project_id);

-- ---------- documents ----------
create table if not exists public.job_documents (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  name text not null default '',
  mime text not null default 'application/octet-stream',
  size bigint not null default 0,
  file_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists job_documents_project_idx on public.job_documents (project_id);

-- ---------- sync stamps + team access (same rules as the other job tables) ----------
do $$
declare t text;
begin
  foreach t in array array['photos','photo_comments','checklists','job_logs','job_documents'] loop
    execute format('drop trigger if exists %I_synced_at on public.%I', t, t);
    execute format('create trigger %I_synced_at before insert or update on public.%I for each row execute function public.set_synced_at()', t, t);
    execute format('create index if not exists %I_synced_at_idx on public.%I (synced_at)', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_member on public.%I', t, t);
    execute format('create policy %I_member on public.%I for all using (public.is_project_member(project_id)) with check (public.is_project_member(project_id))', t, t);
  end loop;
end $$;

-- ---------- shareable photo reports (a frozen set of photos behind a link, like proposals) ----------
create table if not exists public.photo_reports (
  id text primary key check (length(id) >= 20),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null,
  snapshot jsonb not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists photo_reports_project_idx on public.photo_reports (project_id);
alter table public.photo_reports enable row level security;
drop policy if exists photo_reports_team on public.photo_reports;
create policy photo_reports_team on public.photo_reports for all
  using (owner_id = auth.uid() or public.is_project_member(project_id))
  with check (owner_id = auth.uid());

create or replace function public.get_photo_report(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when r.revoked then null else jsonb_build_object('snapshot', r.snapshot, 'createdAt', r.created_at) end
  from public.photo_reports r where r.id = p_token
$$;
revoke all on function public.get_photo_report(text) from public;
grant execute on function public.get_photo_report(text) to anon, authenticated;

notify pgrst, 'reload schema';
