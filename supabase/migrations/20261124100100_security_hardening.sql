-- Security hardening before launch: closes the holes found by the row-security and storage audits.
-- Checked by supabase/tests/security_test.sql. Billing rules (plan status, trial, seats, the paywall) are not changed
-- here. Safe to run more than once.
--
--   1. Proposal and photo report files: nobody can list another person's folder (public links keep working).
--   2. A job's owner can't be changed from the apps (no taking over a job); team rows keep their id and owner.
--   3. Real deletes on job data are office work, and are refused like other writes when the subscription has lapsed.
--   4. Someone who leaves (or is removed from) a team leaves their jobs, proposals and photo reports with the company.
--   5. Proposals, photo reports, client links and payments can only be filed on a job (and document) you work on.
--   6. Job sharing rows (project_members) are written by the database only; a stale 'owner' row grants nothing.
--   7. Helper functions are not callable signed out; row rules apply to signed-in users only (signed-out visitors
--      read nothing, without an error); TRUNCATE / REFERENCES / TRIGGER are taken away from the API roles.

-- ---------- 1. proposals bucket: read (list) only your own folder ----------
-- The bucket is public, so the links in a proposal or photo report (…/object/public/proposals/…) keep working without
-- any read rule. Listing the bucket through the API, though, showed every company's tokens and files.
drop policy if exists proposals_files_read on storage.objects;
create policy proposals_files_read on storage.objects for select to authenticated
  using (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists proposals_files_insert on storage.objects;
create policy proposals_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists proposals_files_update on storage.objects;
create policy proposals_files_update on storage.objects for update to authenticated
  using (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists proposals_files_delete on storage.objects;
create policy proposals_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text);

-- Plan images: same rules as before, for signed-in users only; deleting a file is office work (techs can't).
drop policy if exists plans_read on storage.objects;
create policy plans_read on storage.objects for select to authenticated
  using (bucket_id = 'plans' and public.is_project_member((storage.foldername(name))[1]));
drop policy if exists plans_insert on storage.objects;
create policy plans_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'plans' and public.is_project_member((storage.foldername(name))[1]));
drop policy if exists plans_update on storage.objects;
create policy plans_update on storage.objects for update to authenticated
  using (bucket_id = 'plans' and public.is_project_member((storage.foldername(name))[1]))
  with check (bucket_id = 'plans' and public.is_project_member((storage.foldername(name))[1]));
drop policy if exists plans_delete on storage.objects;
create policy plans_delete on storage.objects for delete to authenticated
  using (bucket_id = 'plans' and public.is_project_member((storage.foldername(name))[1]) and not public.is_tech());

-- ---------- 6. job access: only the database writes project_members ----------
-- The old rule let a job's owner add anyone to it (and the apps never use it). Rows are added by the projects trigger
-- (the owner) and removed by remove_team_member; an 'owner' row only counts while that person still owns the job, so a
-- job handed to the company (account deletion, leaving a team) doesn't stay open to its old owner.
drop policy if exists members_manage on public.project_members;

create or replace function public.is_project_member(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = pid and p.owner_id = auth.uid())
      or exists (select 1 from public.project_members m join public.projects p on p.id = m.project_id
                 where m.project_id = pid and m.user_id = auth.uid() and (m.role <> 'owner' or p.owner_id = m.user_id))
      or exists (select 1 from public.projects p
                 join public.team_members owner_m on owner_m.user_id = p.owner_id
                 join public.team_members me on me.team_id = owner_m.team_id and me.user_id = auth.uid()
                 where p.id = pid);
$$;

-- ---------- 2a. projects: the owner never changes from the apps ----------
-- Any member could set owner_id to themselves (or to someone outside the company) and take the job with them.
-- Invoker rights on purpose: the server (service role), the SQL editor and our own functions (remove_team_member,
-- account deletion) may still hand a job over.
create or replace function public.projects_owner_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and new.owner_id is distinct from old.owner_id then
    raise exception 'A job''s owner can''t be changed' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists projects_owner_guard on public.projects;
create trigger projects_owner_guard before update on public.projects
  for each row execute function public.projects_owner_guard();

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using (owner_id = auth.uid() or public.is_project_member(id))
  with check (owner_id = auth.uid() or public.is_project_member(id));

-- ---------- 2b. teams: the apps may only rename and set trades ----------
revoke update on public.teams from authenticated, anon;
grant update (name, trades, updated_at) on public.teams to authenticated;

-- Belt and braces (a later grant of more columns mustn't reopen this): a team keeps its id, owner and creation date,
-- and a team made from the apps belongs to whoever made it. The name sorts before teams_billing_guard and
-- teams_founder_comp, so those see the real owner.
create or replace function public.teams_a_owner_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    return new;
  end if;
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at then
    raise exception 'A company''s owner can''t be changed here' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists teams_a_owner_guard on public.teams;
create trigger teams_a_owner_guard before insert or update on public.teams
  for each row execute function public.teams_a_owner_guard();

-- ---------- 3. job tables: read/add/edit for everyone on the job, real deletes for the office ----------
-- The apps only soft-delete (deleted = true). A `for all` rule also let any technician wipe rows (or a whole sheet's
-- devices) for real through the API, where no one can see or undo it.
do $$
declare t text;
begin
  foreach t in array array['sheets', 'closets', 'markers', 'runs', 'photos', 'photo_comments', 'checklists', 'job_logs',
                           'job_documents', 'measurements', 'rfis', 'schedule_items', 'job_forms'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t || '_member', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_project_member(project_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_project_member(project_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_project_member(project_id)) with check (public.is_project_member(project_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_project_member(project_id) and not public.is_tech())', t || '_delete', t);
  end loop;
end $$;

-- Real deletes are refused when the subscription has lapsed, like inserts and updates (job_write_guard). A separate
-- trigger, so the paywall's own guard can change without dropping this one.
create or replace function public.job_delete_guard() returns trigger
language plpgsql set search_path = public as $$
declare owner uuid;
begin
  if current_user <> 'authenticated' then return old; end if;
  if tg_table_name in ('projects', 'proposals') then
    owner := old.owner_id;
  elsif tg_table_name = 'job_templates' then
    owner := public.job_template_owner(old.team_id, old.created_by);
  else
    owner := public.project_owner(old.project_id);
  end if;
  if owner is not null and not public.team_can_write(owner) then
    raise exception 'PinPlan subscription inactive'
      using errcode = 'P0001', detail = 'This company''s PinPlan subscription has lapsed, so its jobs are read-only.',
            hint = 'The owner or an admin can restart the subscription in Settings → Billing.';
  end if;
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['projects', 'sheets', 'closets', 'markers', 'runs', 'estimate_lines', 'photos', 'photo_comments',
                           'checklists', 'job_logs', 'job_documents', 'proposals', 'sales_documents', 'sales_document_payments',
                           'document_links', 'change_orders', 'schedule_items', 'job_forms', 'measurements', 'sheet_links',
                           'tasks', 'plan_markups', 'rfis', 'job_templates'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_delete_guard', t);
      execute format('create trigger %I before delete on public.%I for each row execute function public.job_delete_guard()', t || '_delete_guard', t);
    end if;
  end loop;
end $$;

-- ---------- 4. leaving a team: the work stays with the company ----------
-- Same checks as before. The person's jobs (and the proposals and photo reports on them) move to the team owner, and
-- their job sharing rows go, so they really lose access. Their own login and catalog are untouched.
create or replace function public.remove_team_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me public.team_members; them public.team_members; boss uuid;
begin
  select * into me from public.team_members where user_id = auth.uid();
  select * into them from public.team_members where user_id = p_user;
  if them.team_id is null or them.team_id is distinct from me.team_id then
    raise exception 'Not on your team' using errcode = '42501';
  end if;
  if them.role = 'owner' then raise exception 'The owner can''t be removed' using errcode = '42501'; end if;
  -- Anyone may leave; removing someone else takes the owner or an admin.
  if p_user <> auth.uid() and me.role not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can remove people' using errcode = '42501';
  end if;
  select owner_id into boss from public.teams where id = them.team_id;
  if boss is not null and boss <> p_user then
    update public.projects set owner_id = boss where owner_id = p_user;
    update public.proposals set owner_id = boss where owner_id = p_user;
    update public.photo_reports set owner_id = boss where owner_id = p_user;
    if to_regclass('public.document_links') is not null then
      update public.document_links set owner_id = boss where owner_id = p_user;
    end if;
    -- Their rows on the company's jobs (the 'owner' rows of the jobs just handed over, or any shared job).
    delete from public.project_members m
    using public.projects p, public.team_members o
    where m.user_id = p_user and p.id = m.project_id and o.user_id = p.owner_id and o.team_id = them.team_id;
  end if;
  delete from public.team_members where user_id = p_user;
end $$;
revoke all on function public.remove_team_member(uuid) from public, anon;
grant execute on function public.remove_team_member(uuid) to authenticated;

-- ---------- 5. links and payments only on your own jobs ----------
-- proposals / photo_reports had no foreign key on project_id and only checked owner_id, so anyone signed in could file
-- one under any job id. Office staff may now also withdraw a proposal or link someone else on the job published.
drop policy if exists proposals_team on public.proposals;
drop policy if exists proposals_select on public.proposals;
drop policy if exists proposals_insert on public.proposals;
drop policy if exists proposals_update on public.proposals;
drop policy if exists proposals_delete on public.proposals;
create policy proposals_select on public.proposals for select to authenticated
  using ((owner_id = auth.uid() or public.is_project_member(project_id)) and not public.is_tech());
create policy proposals_insert on public.proposals for insert to authenticated
  with check (owner_id = auth.uid() and public.is_project_member(project_id) and not public.is_tech());
create policy proposals_update on public.proposals for update to authenticated
  using ((owner_id = auth.uid() or public.is_project_member(project_id)) and not public.is_tech())
  with check (public.is_project_member(project_id) and not public.is_tech());
create policy proposals_delete on public.proposals for delete to authenticated
  using ((owner_id = auth.uid() or public.is_project_member(project_id)) and not public.is_tech());

drop policy if exists photo_reports_team on public.photo_reports;
drop policy if exists photo_reports_select on public.photo_reports;
drop policy if exists photo_reports_insert on public.photo_reports;
drop policy if exists photo_reports_update on public.photo_reports;
drop policy if exists photo_reports_delete on public.photo_reports;
create policy photo_reports_select on public.photo_reports for select to authenticated
  using (owner_id = auth.uid() or public.is_project_member(project_id));
create policy photo_reports_insert on public.photo_reports for insert to authenticated
  with check (owner_id = auth.uid() and public.is_project_member(project_id));
create policy photo_reports_update on public.photo_reports for update to authenticated
  using (owner_id = auth.uid() or public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
create policy photo_reports_delete on public.photo_reports for delete to authenticated
  using (owner_id = auth.uid() or (public.is_project_member(project_id) and not public.is_tech()));

-- A client link or a payment names a document: it must be a document on that same job (not another company's).
drop policy if exists document_links_office on public.document_links;
drop policy if exists document_links_select on public.document_links;
drop policy if exists document_links_insert on public.document_links;
drop policy if exists document_links_update on public.document_links;
drop policy if exists document_links_delete on public.document_links;
create policy document_links_select on public.document_links for select to authenticated
  using (public.is_project_member(project_id) and not public.is_tech());
create policy document_links_insert on public.document_links for insert to authenticated
  with check (owner_id = auth.uid() and public.is_project_member(project_id) and not public.is_tech()
              and exists (select 1 from public.sales_documents d where d.id = document_id and d.project_id = document_links.project_id));
create policy document_links_update on public.document_links for update to authenticated
  using (public.is_project_member(project_id) and not public.is_tech())
  with check (public.is_project_member(project_id) and not public.is_tech()
              and exists (select 1 from public.sales_documents d where d.id = document_id and d.project_id = document_links.project_id));
create policy document_links_delete on public.document_links for delete to authenticated
  using (public.is_project_member(project_id) and not public.is_tech());

drop policy if exists sales_document_payments_office on public.sales_document_payments;
create policy sales_document_payments_office on public.sales_document_payments for all to authenticated
  using (public.is_project_member(project_id) and not public.is_tech())
  with check (public.is_project_member(project_id) and not public.is_tech()
              and exists (select 1 from public.sales_documents d where d.id = document_id and d.project_id = sales_document_payments.project_id));

-- ---------- 7. helper functions and table rights ----------
-- Owner lookups answer only for a job you work on (or for the server / our own functions, which run without a
-- signed-in user), so they can't be used to find out who owns any job id.
create or replace function public.project_owner(pid text) returns uuid
language sql stable security definer set search_path = public as $$
  select p.owner_id from public.projects p
  where p.id = pid and (auth.uid() is null or public.is_project_member(pid));
$$;

create or replace function public.billing_owner(pid text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(t.owner_id, p.owner_id)
  from public.projects p
  left join public.team_members m on m.user_id = p.owner_id
  left join public.teams t on t.id = m.team_id
  where p.id = pid and (auth.uid() is null or public.is_project_member(pid));
$$;

-- Row rules written for "everyone" become rules for signed-in users: a signed-out visitor matches none and reads
-- nothing, instead of running the helper functions below (which they may no longer call).
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname in ('public', 'storage') and roles = '{public}'
             and (schemaname = 'public' or tablename = 'objects') loop
    execute format('alter policy %I on %I.%I to authenticated', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Security-definer functions run with the owner's rights: signed out, only the client link pages and the invite
-- lookup may call them. Everything else keeps the grants it had for signed-in users and the server.
do $$
declare f record; was_auth boolean; was_service boolean;
begin
  for f in select p.oid, p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prosecdef
             and p.proname not in ('get_proposal', 'respond_proposal', 'get_document', 'respond_document', 'get_photo_report', 'team_invite_info') loop
    was_auth := has_function_privilege('authenticated', f.oid, 'execute');
    was_service := has_function_privilege('service_role', f.oid, 'execute');
    execute format('revoke all on function %s from public, anon', f.sig);
    if was_auth then execute format('grant execute on function %s to authenticated', f.sig); end if;
    if was_service then execute format('grant execute on function %s to service_role', f.sig); end if;
  end loop;
end $$;
-- Named explicitly too (the audit's list), in case one of them is ever made security invoker.
revoke all on function public.job_template_owner(uuid, uuid) from public, anon;
revoke all on function public.my_team_id() from public, anon;
revoke all on function public.my_team_role() from public, anon;
revoke all on function public.same_team(uuid) from public, anon;
revoke all on function public.is_tech() from public, anon;
revoke all on function public.is_project_member(text) from public, anon;
grant execute on function public.job_template_owner(uuid, uuid) to authenticated, service_role;
grant execute on function public.my_team_id() to authenticated, service_role;
grant execute on function public.my_team_role() to authenticated, service_role;
grant execute on function public.same_team(uuid) to authenticated, service_role;
grant execute on function public.is_tech() to authenticated, service_role;
grant execute on function public.is_project_member(text) to authenticated, service_role;
grant execute on function public.project_owner(text) to authenticated, service_role;
grant execute on function public.billing_owner(text) to authenticated, service_role;

-- TRUNCATE skips row security entirely, and REFERENCES / TRIGGER are never needed by the apps.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
-- The team tables are signed-in only.
revoke all on public.teams, public.team_members, public.team_invites from anon;

notify pgrst, 'reload schema';
