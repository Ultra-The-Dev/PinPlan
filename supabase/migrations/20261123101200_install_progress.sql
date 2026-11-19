-- Install progress and as-built: each device (marker) and wire run can carry an install status
-- (planned → roughed → installed → tested → verified, or issue) with history, photo ids and a test result.
-- Stored as JSON on the existing rows (see InstallState in src/lib/types.ts). Never counted: takeoff and estimates
-- ignore it. markers and runs are already covered by RLS (is_project_member) and job_write_guard.
-- Safe to run more than once.

alter table public.markers add column if not exists install jsonb;
alter table public.runs add column if not exists install jsonb;

-- Verifying is office work: a technician can't set "verified", and can't change the install record of a device the
-- office already verified. The app already enforces this; here the database does too. A blocked change keeps the
-- stored install record (rather than failing the write), so an offline tech's queued edits of other fields still sync.
create or replace function public.install_verify_guard() returns trigger
language plpgsql set search_path = public as $$
declare old_status text := case when tg_op = 'UPDATE' then old.install->>'status' end;
begin
  if current_user <> 'authenticated' or not public.is_tech() then return new; end if;
  if tg_op = 'INSERT' then
    if new.install->>'status' = 'verified' then new.install := null; end if;
    return new;
  end if;
  if new.install is distinct from old.install
     and (old_status = 'verified' or new.install->>'status' = 'verified') then
    new.install := old.install;
  end if;
  return new;
end $$;

drop trigger if exists markers_install_guard on public.markers;
create trigger markers_install_guard before insert or update on public.markers
  for each row execute function public.install_verify_guard();
drop trigger if exists runs_install_guard on public.runs;
create trigger runs_install_guard before insert or update on public.runs
  for each row execute function public.install_verify_guard();
