-- Saved measurements: lengths, runs (polylines) and areas drawn on a calibrated sheet, grouped by label and pushed
-- into the estimate as custom lines. Only geometry is stored (relative 0–1 points); feet and square feet are always
-- computed in the apps from the sheet's current scale. See docs/saved-measurements.md. Safe to run more than once.

create table if not exists public.measurements (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  -- Soft link (no foreign key): the sheet may sync later.
  sheet_id text not null default '',
  kind text not null,
  points jsonb not null,
  label text,
  color text,
  extra_ft double precision,
  waste_pct double precision,
  notes text,
  author text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists measurements_project_idx on public.measurements (project_id);

-- Same as photos (20261119000000_field_docs.sql): pull watermark, members of the job read and write (techs too:
-- measurements carry no prices), and read-only when the company's subscription has lapsed (job_write_guard,
-- 20261121000000_billing.sql).
drop trigger if exists measurements_synced_at on public.measurements;
create trigger measurements_synced_at before insert or update on public.measurements
  for each row execute function public.set_synced_at();
create index if not exists measurements_synced_at_idx on public.measurements (synced_at);

alter table public.measurements enable row level security;
drop policy if exists measurements_member on public.measurements;
create policy measurements_member on public.measurements for all
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

drop trigger if exists measurements_write_guard on public.measurements;
create trigger measurements_write_guard before insert or update on public.measurements
  for each row execute function public.job_write_guard();
