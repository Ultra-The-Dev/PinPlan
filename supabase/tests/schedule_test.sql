-- Job schedule checks: run after the migrations (also works inside a transaction that is rolled back).
-- Any failed check raises an exception.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000005a1', 'sched-owner@example.com'),
                                          ('00000000-0000-0000-0000-0000000005a2', 'sched-tech@example.com'),
                                          ('00000000-0000-0000-0000-0000000005a3', 'sched-outsider@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'SCHEDULE CHECK FAILED: %', what; end if;
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

-- The owner plans a job and starts a team with a tech.
select pg_temp.as_user('00000000-0000-0000-0000-0000000005a1');
insert into public.projects (id, client_name, address, status) values ('sp1', 'Client', '1 Schedule St', 'approved');
insert into public.schedule_items (id, project_id, name, start_date, end_date, crew, depends_on, progress, sort_order)
  values ('si1', 'sp1', 'Pre-wire', '2026-11-23', '2026-11-25', '["Tom"]', '[]', 0, 0);
insert into public.schedule_items (id, project_id, name, start_date, end_date, crew, depends_on, sheet_ids)
  values ('si2', 'sp1', 'Trim', '2026-11-30', '2026-12-01', null, '[{"id": "si1", "lagDays": 2}]', null);
select pg_temp.check((select crew = '[]'::jsonb and sheet_ids = '[]'::jsonb from public.schedule_items where id = 'si2'), 'null lists are stored as []');
select pg_temp.check((select synced_at is not null from public.schedule_items where id = 'si1'), 'rows get a sync stamp');
select pg_temp.check(pg_temp.fails($$insert into public.schedule_items (id, project_id, name, start_date, end_date) values ('si3', 'sp1', 'Bad', '2026-11-25', '2026-11-24')$$), 'end before start is rejected');
select pg_temp.check(pg_temp.fails($$insert into public.schedule_items (id, project_id, name, start_date, end_date, progress) values ('si4', 'sp1', 'Bad', '2026-11-25', '2026-11-25', 150)$$), 'progress over 100 is rejected');
select pg_temp.check(public.create_team('Schedule Co', 'Olivia') is not null, 'owner creates a team');
insert into public.team_invites (code, team_id, role, name) values ('SCHEDTECH1', public.my_team_id(), 'tech', 'Tom');

-- The tech sees the schedule and updates progress (no money in it, so techs may write).
select pg_temp.as_user('00000000-0000-0000-0000-0000000005a2');
select pg_temp.check((select count(*) from public.schedule_items where project_id = 'sp1') = 0, 'not on the team yet: nothing');
select pg_temp.check(public.accept_team_invite('SCHEDTECH1', '') ->> 'role' = 'tech', 'tech joins');
select pg_temp.check((select count(*) from public.schedule_items where project_id = 'sp1') = 2, 'tech sees the job schedule');
update public.schedule_items set progress = 60, notes = 'Attic done' where id = 'si1';
select pg_temp.check((select progress from public.schedule_items where id = 'si1') = 60, 'tech updates progress');

-- Someone outside the team sees and writes nothing.
select pg_temp.as_user('00000000-0000-0000-0000-0000000005a3');
select pg_temp.check((select count(*) from public.schedule_items) = 0, 'outsider sees no schedule');
select pg_temp.check(pg_temp.fails($$insert into public.schedule_items (id, project_id, name, start_date, end_date) values ('si5', 'sp1', 'Sneaky', '2026-11-23', '2026-11-23')$$), 'outsider cannot add to the schedule');
update public.schedule_items set progress = 0 where id = 'si1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000005a1');
select pg_temp.check((select progress from public.schedule_items where id = 'si1') = 60, 'outsider update changed nothing');
select pg_temp.check(exists (select 1 from pg_trigger where tgname = 'schedule_items_write_guard'), 'billing read-only lock is installed');

reset role;
select 'SCHEDULE CHECKS PASSED';
