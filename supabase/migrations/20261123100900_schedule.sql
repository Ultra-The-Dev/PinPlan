-- Job schedule: phases (Pre-wire, Rough-in, Inspection, Trim, Final or custom) with dates, crew, planned hours,
-- % complete and finish-to-start dependencies. See docs/schedule-lookahead.md. Safe to run more than once.
--
-- No money here, so the whole team (techs included) reads and writes it, like checklists. Who may move/delete phases
-- (the office) vs. update progress and notes (crew) is enforced in the apps.

create table if not exists public.schedule_items (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  name text not null default '',
  phase text,
  start_date date not null,
  end_date date not null,
  crew jsonb not null default '[]'::jsonb,
  hours_planned numeric,
  progress int check (progress is null or (progress between 0 and 100)),
  color text,
  depends_on jsonb not null default '[]'::jsonb,
  sheet_ids jsonb not null default '[]'::jsonb,
  notes text,
  sort_order int,
  workdays_only boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists schedule_items_project_idx on public.schedule_items (project_id);

-- JSON columns: the apps send null for an empty list; store '[]' instead so readers never see null.
create or replace function public.schedule_items_defaults() returns trigger
language plpgsql as $$
begin
  new.crew := coalesce(new.crew, '[]'::jsonb);
  new.depends_on := coalesce(new.depends_on, '[]'::jsonb);
  new.sheet_ids := coalesce(new.sheet_ids, '[]'::jsonb);
  return new;
end $$;
drop trigger if exists schedule_items_defaults on public.schedule_items;
create trigger schedule_items_defaults before insert or update on public.schedule_items
  for each row execute function public.schedule_items_defaults();

-- Sync stamp, team access and the billing read-only lock (same rules as the other job tables).
drop trigger if exists schedule_items_synced_at on public.schedule_items;
create trigger schedule_items_synced_at before insert or update on public.schedule_items for each row execute function public.set_synced_at();
create index if not exists schedule_items_synced_at_idx on public.schedule_items (synced_at);
alter table public.schedule_items enable row level security;
drop policy if exists schedule_items_member on public.schedule_items;
create policy schedule_items_member on public.schedule_items for all
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

do $$
begin
  if to_regprocedure('public.job_write_guard()') is not null then
    drop trigger if exists schedule_items_write_guard on public.schedule_items;
    create trigger schedule_items_write_guard before insert or update on public.schedule_items
      for each row execute function public.job_write_guard();
  end if;
end $$;
