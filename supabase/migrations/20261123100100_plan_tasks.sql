-- Tasks pinned on the plan (Fieldwire-style punch / issues): status, priority, trade, assignee, photos, checklist and
-- activity. A child of a job like photos and checklists: same team access, soft deletes, synced_at stamps and the
-- billing read-only guard. Tasks never carry prices, so technicians see and edit them. Safe to run more than once.

create table if not exists public.tasks (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  number integer not null default 0,
  title text not null default '',
  description text,
  status text not null default 'open',
  priority integer,
  category text,
  assignee text,
  watchers jsonb,
  due date,
  start_date date,
  -- Soft links (no foreign keys): the sheet or device may sync later.
  sheet_id text,
  x double precision,
  y double precision,
  marker_id text,
  room text,
  tags jsonb,
  checklist jsonb,
  photo_ids jsonb,
  activity jsonb,
  created_by text,
  closed_at timestamptz,
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists tasks_project_idx on public.tasks (project_id);

-- Sync stamps + team access (the same rules as photos and checklists in 20261119000000_field_docs.sql).
-- Deletes are soft (deleted = true), so there is no delete policy.
drop trigger if exists tasks_synced_at on public.tasks;
create trigger tasks_synced_at before insert or update on public.tasks for each row execute function public.set_synced_at();
create index if not exists tasks_synced_at_idx on public.tasks (synced_at);
alter table public.tasks enable row level security;
drop policy if exists tasks_member on public.tasks;
drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
create policy tasks_select on public.tasks for select using (public.is_project_member(project_id));
create policy tasks_insert on public.tasks for insert with check (public.is_project_member(project_id));
create policy tasks_update on public.tasks for update using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

-- Only the office verifies. A technician's write can't set or clear Verified: the old values are kept (no error, so a
-- device's sync queue never stalls on it). The apps already hide the option from technicians.
create or replace function public.tasks_verify_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_tech() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status = 'verified' then
      new.status := 'done';
    end if;
    new.verified_by := null;
    new.verified_at := null;
  elsif (new.status = 'verified') <> (old.status = 'verified') then
    new.status := old.status;
    new.verified_by := old.verified_by;
    new.verified_at := old.verified_at;
    new.closed_at := old.closed_at;
  else
    new.verified_by := old.verified_by;
    new.verified_at := old.verified_at;
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_verify_guard on public.tasks;
create trigger tasks_verify_guard before insert or update on public.tasks for each row execute function public.tasks_verify_guard();

-- Read-only when the company's subscription has lapsed (job_write_guard, 20261121000000_billing.sql).
drop trigger if exists tasks_write_guard on public.tasks;
create trigger tasks_write_guard before insert or update on public.tasks for each row execute function public.job_write_guard();

notify pgrst, 'reload schema';
