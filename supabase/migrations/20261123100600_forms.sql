-- Typed forms and inspections (src/lib/forms): inspection requests, test records, T&M tags, safety forms and
-- sign-offs filled on a job, signed and locked on submit. The template is a snapshot taken when the form was started.
-- Company templates live in the app settings (like checklist templates); built-ins live in the apps.
-- No prices on forms, so everyone on the job (technicians too) can read and fill them. Safe to run more than once.

create table if not exists public.job_forms (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  template_id text not null default '',
  name text not null default '',
  template jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  "values" jsonb not null default '{}'::jsonb,
  signatures jsonb,
  sheet_id text,
  x double precision,
  y double precision,
  marker_id text,
  photo_ids jsonb,
  submitted_by text,
  submitted_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists job_forms_project_idx on public.job_forms (project_id);

-- ---------- sync stamp + team access (same rules as checklists) ----------
drop trigger if exists job_forms_synced_at on public.job_forms;
create trigger job_forms_synced_at before insert or update on public.job_forms
  for each row execute function public.set_synced_at();
create index if not exists job_forms_synced_at_idx on public.job_forms (synced_at);

alter table public.job_forms enable row level security;
drop policy if exists job_forms_member on public.job_forms;
create policy job_forms_member on public.job_forms for all
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

-- ---------- submitted forms are locked ----------
-- Technicians fill, sign and submit; only the office (owner / admin) reopens, changes or deletes a submitted form.
-- Re-sending the same submitted row (sync retries) is fine.
create or replace function public.job_forms_lock() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' or not public.is_tech() then return new; end if;
  if old.status = 'submitted' and (
       new.status is distinct from old.status
       or new.deleted is distinct from old.deleted
       or new."values" is distinct from old."values"
       or new.signatures is distinct from old.signatures
       or new.template is distinct from old.template) then
    raise exception 'This form was submitted and is locked'
      using errcode = '42501', hint = 'Ask the office to reopen it.';
  end if;
  return new;
end $$;
drop trigger if exists job_forms_lock on public.job_forms;
create trigger job_forms_lock before update on public.job_forms
  for each row execute function public.job_forms_lock();

-- ---------- read-only when the subscription has lapsed (same guard as the other job tables) ----------
do $$
begin
  if to_regprocedure('public.job_write_guard()') is not null then
    drop trigger if exists job_forms_write_guard on public.job_forms;
    create trigger job_forms_write_guard before insert or update on public.job_forms
      for each row execute function public.job_write_guard();
  end if;
end $$;
