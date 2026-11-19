-- Install progress and as-built: each device (marker) and wire run can carry an install status
-- (planned → roughed → installed → tested → verified, or issue) with history, photo ids and a test result.
-- Stored as JSON on the existing rows (see InstallState in src/lib/types.ts). Never counted: takeoff and estimates
-- ignore it. markers and runs are already covered by RLS (is_project_member) and job_write_guard.
-- Safe to run more than once.

alter table public.markers add column if not exists install jsonb;
alter table public.runs add column if not exists install jsonb;
