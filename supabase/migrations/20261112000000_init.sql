-- PinPlan initial schema. Ids are client-generated text (nanoid) so devices can create rows offline.
-- `updated_at` is the client's edit time (last-write-wins); `synced_at` is server time, used as the pull watermark.

create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.set_synced_at() returns trigger
language plpgsql as $$
begin
  new.synced_at := now();
  return new;
end $$;

-- ---------- projects ----------
create table public.projects (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_name text not null default '',
  client_email text,
  client_phone text,
  address text not null default '',
  status text not null default 'estimate' check (status in ('estimate', 'approved', 'installed')),
  notes text,
  billdu_client_id bigint,
  billdu_docs jsonb not null default '[]'::jsonb,
  pricing jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);

create table public.project_members (
  project_id text not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create or replace function public.is_project_member(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = pid and p.owner_id = auth.uid())
      or exists (select 1 from public.project_members m where m.project_id = pid and m.user_id = auth.uid());
$$;

create or replace function public.add_project_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;

create trigger projects_add_owner after insert on public.projects
  for each row execute function public.add_project_owner();

-- ---------- sheets ----------
create table public.sheets (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  name text not null default '',
  page_number integer not null default 1,
  sort_order integer not null default 0,
  image_id text not null,
  image_path text,
  width integer not null,
  height integer not null,
  px_per_ft double precision,
  px_per_inch double precision,
  scale_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index sheets_project_idx on public.sheets (project_id);

-- ---------- device catalog (one catalog per account owner) ----------
create table public.device_types (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  category text not null check (category in ('security','network','audio','video','smarthome','lighting','shades','infrastructure')),
  symbol text not null default '',
  abbrev text not null default '',
  shape text not null default 'circle',
  color text not null default '#000000',
  unit text not null default 'each' check (unit in ('each', 'LF')),
  unit_price double precision not null default 0,
  labor_price double precision not null default 0,
  default_wire text not null default '',
  default_mount text not null default 'ceiling',
  kind text not null default 'device' check (kind in ('device', 'led')),
  billdu_product_id bigint,
  sort_order integer not null default 0,
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (owner_id, id)
);

-- ---------- closets ----------
create table public.closets (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  sheet_id text not null references public.sheets (id) on delete cascade,
  kind text not null check (kind in ('equipment', 'switch', 'rack')),
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1),
  name text not null default '',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index closets_project_idx on public.closets (project_id);

-- ---------- markers ----------
create table public.markers (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  sheet_id text not null references public.sheets (id) on delete cascade,
  device_type_id text not null,
  x double precision not null check (x between 0 and 1),
  y double precision not null check (y between 0 and 1),
  label text not null default '',
  room text not null default '',
  mount text not null default 'ceiling',
  wire_type text not null default '',
  closet_id text,
  tentative boolean not null default false,
  notes text not null default '',
  photo_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index markers_project_idx on public.markers (project_id);

-- ---------- runs (LED, stair LED, wire) ----------
create table public.runs (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  sheet_id text not null references public.sheets (id) on delete cascade,
  kind text not null check (kind in ('led', 'stair', 'wire')),
  device_type_id text,
  points jsonb not null default '[]'::jsonb,
  measured_ft double precision,
  typed_ft double precision,
  zone text,
  switch_label text,
  steps integer,
  lf_per_step double precision,
  wire_type text,
  marker_id text,
  closet_id text,
  tentative boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index runs_project_idx on public.runs (project_id);

-- ---------- estimate overrides / custom lines ----------
create table public.estimate_lines (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  key text not null,
  description text,
  qty double precision,
  unit text,
  unit_price double precision,
  removed boolean not null default false,
  include boolean,
  sort_order integer,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index estimate_lines_project_idx on public.estimate_lines (project_id);

-- ---------- synced_at triggers + watermark indexes ----------
do $$
declare t text;
begin
  foreach t in array array['projects','sheets','device_types','closets','markers','runs','estimate_lines'] loop
    execute format('create trigger %I_synced_at before insert or update on public.%I for each row execute function public.set_synced_at()', t, t);
    execute format('create index %I_synced_at_idx on public.%I (synced_at)', t, t);
  end loop;
end $$;

-- ---------- row-level security ----------
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.sheets enable row level security;
alter table public.device_types enable row level security;
alter table public.closets enable row level security;
alter table public.markers enable row level security;
alter table public.runs enable row level security;
alter table public.estimate_lines enable row level security;

create policy projects_select on public.projects for select using (public.is_project_member(id));
create policy projects_insert on public.projects for insert with check (owner_id = auth.uid());
create policy projects_update on public.projects for update using (public.is_project_member(id));
create policy projects_delete on public.projects for delete using (owner_id = auth.uid());

create policy members_select on public.project_members for select using (public.is_project_member(project_id));
create policy members_manage on public.project_members for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy device_types_owner on public.device_types for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['sheets','closets','markers','runs','estimate_lines'] loop
    execute format('create policy %I_member on public.%I for all using (public.is_project_member(project_id)) with check (public.is_project_member(project_id))', t, t);
  end loop;
end $$;

-- ---------- storage: private bucket for plan images, path = <project_id>/<image_id> ----------
insert into storage.buckets (id, name, public) values ('plans', 'plans', false)
  on conflict (id) do nothing;

create policy plans_read on storage.objects for select
  using (bucket_id = 'plans' and public.is_project_member((storage.foldername(name))[1]));
create policy plans_insert on storage.objects for insert
  with check (bucket_id = 'plans' and public.is_project_member((storage.foldername(name))[1]));
create policy plans_update on storage.objects for update
  using (bucket_id = 'plans' and public.is_project_member((storage.foldername(name))[1]));
create policy plans_delete on storage.objects for delete
  using (bucket_id = 'plans' and public.is_project_member((storage.foldername(name))[1]));
