-- Form checks (job_forms): run after the migrations (also works inside a transaction that is rolled back).
-- Everyone on the job fills forms; a submitted form is locked for technicians; outsiders see nothing.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'fowner@example.com'),
                                          ('00000000-0000-0000-0000-0000000000a2', 'ftech@example.com'),
                                          ('00000000-0000-0000-0000-0000000000a4', 'foutsider@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FORMS CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;

set role authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.projects (id, client_name, address, status) values ('fp1', 'Client', '1 Form St', 'estimate');
select pg_temp.check(public.create_team('Forms Co', 'Olga') is not null, 'owner creates a team');
insert into public.team_invites (code, team_id, role, name) values ('FORMTECH1', public.my_team_id(), 'tech', 'Tim');
insert into public.job_forms (id, project_id, template_id, name, template, status, "values")
  values ('jf1', 'fp1', 'tm_tag', 'T&M tag', '{"id":"tm_tag","fields":[]}', 'draft', '{"date":"2026-11-19"}');
select pg_temp.check((select count(*) from public.job_forms where project_id = 'fp1') = 1, 'owner adds a form');
select pg_temp.check((select synced_at is not null from public.job_forms where id = 'jf1'), 'synced_at is stamped');
select pg_temp.check(pg_temp.fails($$insert into public.job_forms (id, project_id, template, status) values ('jfx', 'fp1', '{}', 'done')$$), 'status must be draft or submitted');

-- The tech fills, signs and submits; then the form is locked for them.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check(public.accept_team_invite('FORMTECH1', '') ->> 'role' = 'tech', 'tech joins');
select pg_temp.check((select count(*) from public.job_forms where project_id = 'fp1') = 1, 'tech sees the job''s forms');
update public.job_forms set "values" = '{"date":"2026-11-19","labor":[{"name":"Tim","hours":2}]}', signatures = '[{"fieldId":"sig","name":"Tim","imageId":"i1"}]' where id = 'jf1';
select pg_temp.check((select "values" -> 'labor' -> 0 ->> 'hours' from public.job_forms where id = 'jf1') = '2', 'tech fills a draft');
update public.job_forms set status = 'submitted', submitted_by = 'Tim', submitted_at = now() where id = 'jf1';
select pg_temp.check((select status from public.job_forms where id = 'jf1') = 'submitted', 'tech submits');
update public.job_forms set updated_at = now() where id = 'jf1';
select pg_temp.check(true, 'tech can re-send the same submitted row');
select pg_temp.check(pg_temp.fails($$update public.job_forms set status = 'draft' where id = 'jf1'$$), 'tech cannot reopen');
select pg_temp.check(pg_temp.fails($$update public.job_forms set "values" = '{}' where id = 'jf1'$$), 'tech cannot change a submitted form');
select pg_temp.check(pg_temp.fails($$update public.job_forms set deleted = true where id = 'jf1'$$), 'tech cannot delete a submitted form');
-- Real deletes are office work: the tech's delete matches nothing (20261124100100_security_hardening.sql).
delete from public.job_forms where id = 'jf1';
select pg_temp.check((select count(*) from public.job_forms where id = 'jf1') = 1, 'tech cannot hard-delete a submitted form');
insert into public.job_forms (id, project_id, template_id, name, template, status) values ('jf2', 'fp1', 'jha', 'JHA', '{}', 'draft');
update public.job_forms set deleted = true where id = 'jf2';
select pg_temp.check((select deleted from public.job_forms where id = 'jf2'), 'tech deletes a draft');

-- The office reopens it.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update public.job_forms set status = 'draft', submitted_at = null where id = 'jf1';
select pg_temp.check((select status from public.job_forms where id = 'jf1') = 'draft', 'office reopens a submitted form');

-- Outsiders see nothing and can't add forms to the job.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select pg_temp.check((select count(*) from public.job_forms) = 0, 'outsider sees no forms');
select pg_temp.check(pg_temp.fails($$insert into public.job_forms (id, project_id, template, status) values ('jf3', 'fp1', '{}', 'draft')$$), 'outsider cannot add a form');

-- Who started a form, and who submitted it and when, are the database's to say (20261124301000_access_guards.sql).
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.job_forms (id, project_id, template_id, name, template, status, created_by, submitted_by, submitted_at)
  values ('jf4', 'fp1', 'jha', 'JHA', '{}', 'draft', 'Someone else', 'Someone else', '2000-01-01');
select pg_temp.check((select created_by = 'Olga' and submitted_by is null and submitted_at is null from public.job_forms where id = 'jf4'),
  'created_by is stamped with the caller''s name; a draft has no submitter');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
update public.job_forms set created_by = 'Tim' where id = 'jf4';
select pg_temp.check((select created_by from public.job_forms where id = 'jf4') = 'Olga', 'created_by never changes');
update public.job_forms set status = 'submitted', submitted_by = 'Olga', submitted_at = '2000-01-01', photo_ids = '["ph1"]' where id = 'jf4';
select pg_temp.check((select submitted_by = 'Tim' and submitted_at > now() - interval '1 minute' from public.job_forms where id = 'jf4'),
  'submitted_by and submitted_at are stamped on submit');
update public.job_forms set submitted_by = 'Olga', submitted_at = '2001-01-01' where id = 'jf4';
select pg_temp.check((select submitted_by = 'Tim' and submitted_at > now() - interval '1 minute' from public.job_forms where id = 'jf4'),
  'the submitter and time stay while the form is submitted');
select pg_temp.check(pg_temp.fails($$update public.job_forms set name = 'Renamed' where id = 'jf4'$$), 'tech cannot rename a submitted form');
select pg_temp.check(pg_temp.fails($$update public.job_forms set photo_ids = '[]' where id = 'jf4'$$), 'tech cannot change a submitted form''s photos');
insert into public.job_forms (id, project_id, template_id, name, template, status, submitted_by, submitted_at)
  values ('jf5', 'fp1', 'jha', 'JHA', '{}', 'submitted', 'Olga', '2000-01-01');
select pg_temp.check((select created_by = 'Tim' and submitted_by = 'Tim' and submitted_at > now() - interval '1 minute' from public.job_forms where id = 'jf5'),
  'a form sent already submitted is stamped too');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update public.job_forms set status = 'draft' where id = 'jf4';
select pg_temp.check((select status = 'draft' and submitted_by is null and submitted_at is null from public.job_forms where id = 'jf4'),
  'reopening clears the submitter');

reset role;
select pg_temp.check(exists (select 1 from pg_trigger where tgname = 'job_forms_write_guard'), 'billing write guard is installed');
select 'FORMS TESTS PASSED';
