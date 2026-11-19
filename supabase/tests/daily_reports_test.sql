-- Structured daily reports (job_logs.report): techs on the team write and read them, outsiders see nothing.
-- Run after the migrations (also works inside a transaction that is rolled back). Any failed check raises an exception.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'dr-owner@example.com'),
                                          ('00000000-0000-0000-0000-0000000000d2', 'dr-tech@example.com'),
                                          ('00000000-0000-0000-0000-0000000000d3', 'dr-outsider@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'DAILY REPORT CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;

set role authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
insert into public.projects (id, client_name, address, status) values ('drp1', 'Client', '9 Report Rd', 'estimate');
select pg_temp.check(public.create_team('Report Co', 'Olga') is not null, 'owner creates a team');
insert into public.team_invites (code, team_id, role, name) values ('DRTECH001', public.my_team_id(), 'tech', 'Tia');
-- A legacy free-text log: no report.
insert into public.job_logs (id, project_id, log_date, title, body) values ('drl0', 'drp1', '2026-11-18', 'Old', 'Pulled wire');
select pg_temp.check((select report from public.job_logs where id = 'drl0') is null, 'legacy log has no report');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select pg_temp.check(public.accept_team_invite('DRTECH001', '') ->> 'role' = 'tech', 'tech joins');
insert into public.job_logs (id, project_id, log_date, title, body, author, report)
  values ('drl1', 'drp1', '2026-11-19', '', '', 'Tia',
          '{"weather":{"summary":"Rain","tempHighF":55,"source":"auto"},"crew":[{"name":"Tia","hours":8},{"name":"Sam","hours":7.5}],"safety":{"incident":false}}');
select pg_temp.check((select (report -> 'crew' -> 1 ->> 'hours')::numeric from public.job_logs where id = 'drl1') = 7.5, 'tech writes a structured report');
update public.job_logs set report = jsonb_set(report, '{signature}', '{"name":"Tia","imageId":"sig1","signedAt":"2026-11-19T22:00:00.000Z"}') where id = 'drl1';
select pg_temp.check((select report -> 'signature' ->> 'imageId' from public.job_logs where id = 'drl1') = 'sig1', 'tech signs it');
select pg_temp.check((select count(*) from public.job_logs where project_id = 'drp1') = 2, 'tech reads the job''s logs');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
select pg_temp.check((select count(*) from public.job_logs where project_id = 'drp1') = 0, 'outsider sees no reports');
update public.job_logs set report = null where id = 'drl1';

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((select report -> 'signature' ->> 'name' from public.job_logs where id = 'drl1') = 'Tia', 'outsider could not change it; owner reads it');

reset role;
select 'DAILY REPORT CHECKS PASSED';
