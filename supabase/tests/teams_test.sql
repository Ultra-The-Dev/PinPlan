-- Team checks: run after the migrations (also works inside a transaction that is rolled back).
-- Any failed check raises an exception.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'owner@example.com'),
                                          ('00000000-0000-0000-0000-0000000000f2', 'tech@example.com'),
                                          ('00000000-0000-0000-0000-0000000000f3', 'office@example.com'),
                                          ('00000000-0000-0000-0000-0000000000f4', 'outsider@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'TEAM CHECK FAILED: %', what; end if;
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

-- The owner has a job with a plan, a priced estimate line and a catalog item, then starts a team.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into public.projects (id, client_name, address, status, pricing) values ('tp1', 'Client', '1 Test St', 'estimate', '{"markup": 20}');
insert into public.sheets (id, project_id, name, page_number, sort_order, image_id, width, height) values ('ts1', 'tp1', 'Main', 1, 0, 'timg1', 1000, 800);
insert into public.estimate_lines (id, project_id, key) values ('tel1', 'tp1', 'dev:cam');
insert into public.device_types (id, name, category) values ('tcam', 'Camera', 'security');
select pg_temp.check(public.create_team('Acme Low Voltage', 'Olivia') is not null, 'owner creates a team');
select pg_temp.check(pg_temp.fails($$select public.create_team('Second', '')$$), 'cannot create a second team');
select pg_temp.check(public.my_team_role() = 'owner', 'creator is the owner');
insert into public.team_invites (code, team_id, role, name) values ('TECHCODE1', public.my_team_id(), 'tech', 'Tom');
insert into public.team_invites (code, team_id, role, name) values ('OFFICECODE1', public.my_team_id(), 'admin', '');
insert into public.team_invites (code, team_id, role, name, expires_at) values ('OLDCODE01', public.my_team_id(), 'tech', '', now() - interval '1 day');

-- Before joining, the tech sees nothing; the invite info is readable by code only.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check((select count(*) from public.projects where id = 'tp1') = 0, 'not a member yet: no jobs');
select pg_temp.check(public.team_invite_info('techcode1') ->> 'team' = 'Acme Low Voltage', 'invite info by code (any case)');
select pg_temp.check(public.team_invite_info('OLDCODE01') is null, 'expired invite shows nothing');
select pg_temp.check((select count(*) from public.team_invites) = 0, 'invite table is not readable to outsiders');
select pg_temp.check(pg_temp.fails($$select public.accept_team_invite('OLDCODE01', '')$$), 'expired invite is refused');
select pg_temp.check(pg_temp.fails($$select public.accept_team_invite('NOPE00000', '')$$), 'unknown code is refused');
select pg_temp.check(public.accept_team_invite('TECHCODE1', '') ->> 'role' = 'tech', 'tech joins with the code');
select pg_temp.check((select name from public.team_members where user_id = auth.uid()) = 'Tom', 'name comes from the invite');

-- The tech works the job: sees it, its plans and the catalog, adds a marker; no prices.
select pg_temp.check((select count(*) from public.projects where id = 'tp1') = 1, 'tech sees the team job');
select pg_temp.check((select count(*) from public.sheets where project_id = 'tp1') = 1, 'tech sees the plans');
select pg_temp.check((select count(*) from public.device_types where id = 'tcam') = 1, 'tech sees the owner''s catalog');
insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, label, room, mount, wire_type, tentative, notes)
  values ('tm1', 'tp1', 'ts1', 'tcam', 0.5, 0.5, 'CAM-1-01', '', 'ceiling', 'Cat6', false, '');
select pg_temp.check((select count(*) from public.markers where project_id = 'tp1') = 1, 'tech adds a device');
select pg_temp.check((select count(*) from public.estimate_lines where project_id = 'tp1') = 0, 'tech cannot read estimate lines');
select pg_temp.check(pg_temp.fails($$insert into public.estimate_lines (id, project_id, key) values ('tel2', 'tp1', 'custom:x')$$), 'tech cannot write estimate lines');
select pg_temp.check(pg_temp.fails($$update public.projects set deleted = true where id = 'tp1'$$), 'tech cannot delete a job');
update public.projects set pricing = '{"markup": 0}', notes = 'gate code 1234' where id = 'tp1';
select pg_temp.check((select pricing ->> 'markup' from public.projects where id = 'tp1') = '20', 'tech cannot change pricing');
select pg_temp.check((select notes from public.projects where id = 'tp1') = 'gate code 1234', 'tech can edit job notes');
select pg_temp.check(pg_temp.fails($$update public.team_members set role = 'admin' where user_id = auth.uid()$$), 'tech cannot promote themselves');
select pg_temp.check(pg_temp.fails($$update public.team_members set email = 'boss@example.com' where user_id = auth.uid()$$), 'member cannot change their email on the team');
update public.team_members set name = 'Tommy' where user_id = auth.uid();
select pg_temp.check((select name from public.team_members where user_id = auth.uid()) = 'Tommy', 'member can rename themselves');
select pg_temp.check((select count(*) from public.team_invites) = 0, 'tech cannot see invites');
select pg_temp.check(pg_temp.fails($$insert into public.team_invites (code, team_id) values ('SNEAKY001', public.my_team_id())$$), 'tech cannot invite');
select pg_temp.check(pg_temp.fails($$select public.remove_team_member('00000000-0000-0000-0000-0000000000f1')$$), 'tech cannot remove the owner');
-- A job the tech starts is visible to the office.
insert into public.projects (id, client_name, address, status) values ('tp2', 'Walk-in', '2 Test St', 'estimate');

-- The office admin joins: full access, including prices and the tech's job; manages the team.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
select pg_temp.check(public.accept_team_invite('OFFICECODE1', 'Pat') ->> 'role' = 'admin', 'admin joins');
select pg_temp.check(pg_temp.fails($$select public.accept_team_invite('TECHCODE1', '')$$), 'a used code can''t be reused by someone else');
select pg_temp.check((select count(*) from public.estimate_lines where project_id = 'tp1') = 1, 'admin sees estimate lines');
select pg_temp.check((select count(*) from public.projects where id in ('tp1', 'tp2')) = 2, 'admin sees owner''s and tech''s jobs');
select pg_temp.check((select count(*) from public.team_members) = 3, 'admin sees the whole team');
select public.set_team_member_role('00000000-0000-0000-0000-0000000000f2', 'admin');
select pg_temp.check((select role from public.team_members where user_id = '00000000-0000-0000-0000-0000000000f2') = 'admin', 'admin promotes the tech');
select public.set_team_member_role('00000000-0000-0000-0000-0000000000f2', 'tech');
select pg_temp.check(pg_temp.fails($$select public.set_team_member_role('00000000-0000-0000-0000-0000000000f1', 'tech')$$), 'owner role can''t be changed');

-- An outsider sees none of it.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f4');
select pg_temp.check((select count(*) from public.projects where id in ('tp1', 'tp2')) = 0, 'outsider sees no team jobs');
select pg_temp.check((select count(*) from public.team_members) = 0, 'outsider sees no members');
select pg_temp.check((select count(*) from public.device_types where id = 'tcam') = 0, 'outsider sees no catalog');
select pg_temp.check(pg_temp.fails($$select public.remove_team_member('00000000-0000-0000-0000-0000000000f2')$$), 'outsider cannot remove members');

-- Removing the tech cuts their access.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select public.remove_team_member('00000000-0000-0000-0000-0000000000f2');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check((select count(*) from public.projects where id = 'tp1') = 0, 'removed tech loses access');
select pg_temp.check((select count(*) from public.projects where id = 'tp2') = 1, 'removed tech keeps the job they own');
