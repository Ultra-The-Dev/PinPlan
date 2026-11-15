-- Fix: saving a new job from the apps (insert-or-update) was refused with 403.
-- Postgres also checks the SELECT/UPDATE rules on the new row during an upsert, and those only asked
-- "is this user a member?", which is filled in by a trigger after the insert. The owner now passes directly.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using (owner_id = auth.uid() or public.is_project_member(id));

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update
  using (owner_id = auth.uid() or public.is_project_member(id));
