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
  if not coalesce(ok, false) then raise exception 'TEAM CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
create function pg_temp.error_of(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
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
insert into public.team_invites (code, team_id, role, name, email) values ('OFFICECODE1', public.my_team_id(), 'admin', '', 'office@example.com');
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
-- Job pricing lives in project_finance, which technicians can't read (20261125000100_price_split_stale_writes.sql).
select pg_temp.check((select pricing from public.projects where id = 'tp1') is null, 'tech reads no pricing on the job');
reset role;
select pg_temp.check((select pricing ->> 'markup' from public.project_finance where project_id = 'tp1') = '20', 'tech cannot change pricing');
set role authenticated;
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
-- A member opening a code that was used by someone else gets their own membership back; nothing changes.
select pg_temp.check(public.accept_team_invite('TECHCODE1', '') ->> 'role' = 'admin', 'a used code gives a member nothing new');
select pg_temp.check((select used_by from public.team_invites where code = 'TECHCODE1') = '00000000-0000-0000-0000-0000000000f2', 'the used code still names who used it');
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
select pg_temp.check((select count(*) from public.projects where id = 'tp2') = 0, 'removed tech''s own job stays with the company');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.check((select owner_id from public.projects where id = 'tp2') = '00000000-0000-0000-0000-0000000000f1', 'the owner now owns the removed tech''s job');

-- ---------- invite codes (20261125001000_access_guards.sql) ----------
reset role;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000f5', 'mail@example.com', null),        -- the invite's address, not confirmed yet
  ('00000000-0000-0000-0000-0000000000f6', 'someone@example.com', now()),
  ('00000000-0000-0000-0000-0000000000f7', 'new@example.com', now()),
  ('00000000-0000-0000-0000-0000000000f8', 'unconfirmed@example.com', null),
  ('00000000-0000-0000-0000-0000000000f9', 'signup@example.com', now());
set role authenticated;

-- A removed person can't come back with the code they used; nobody else can use it either.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.check(pg_temp.fails($$select public.accept_team_invite('TECHCODE1', '')$$), 'a removed tech cannot rejoin with their old code');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f4');
select pg_temp.check(pg_temp.fails($$select public.accept_team_invite('TECHCODE1', '')$$), 'a used code can''t be reused by someone else');
select pg_temp.check(pg_temp.fails($$select public.accept_team_invite('OLDCODE01', '')$$), 'an expired code is still refused');

-- The office makes invites: the database says who made them and caps them at 30 days.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into public.team_invites (code, team_id, role, name, email) values ('MAILCODE01', public.my_team_id(), 'admin', 'Mo', 'mail@example.com');
insert into public.team_invites (code, team_id, role, name, created_by, expires_at, used_by)
  values ('BARECODE01', public.my_team_id(), 'admin', '', '00000000-0000-0000-0000-0000000000f3', now() + interval '1 year', '00000000-0000-0000-0000-0000000000f6');
select pg_temp.check((select created_by = '00000000-0000-0000-0000-0000000000f1' and used_by is null and expires_at <= created_at + interval '30 days'
  from public.team_invites where code = 'BARECODE01'), 'an invite says who made it, starts unused and lives at most 30 days');
update public.team_invites set expires_at = now() + interval '1 year' where code = 'MAILCODE01';
select pg_temp.check((select expires_at <= created_at + interval '30 days' from public.team_invites where code = 'MAILCODE01'), 'an invite can''t be extended past 30 days');

-- An invite sent to an address works only for that address, once confirmed.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f6');
select pg_temp.check(pg_temp.error_of($$select public.accept_team_invite('MAILCODE01', '')$$) like '%different email%', 'another address cannot use an emailed invite');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f5');
select pg_temp.check(pg_temp.error_of($$select public.accept_team_invite('MAILCODE01', '')$$) like '%different email%', 'the invited address must be confirmed first');
reset role;
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000f5';
set role authenticated;
select pg_temp.check(public.accept_team_invite('MAILCODE01', '') ->> 'role' = 'admin', 'the confirmed, invited address joins as an admin');

-- A bare code (no address) never makes an admin.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f7');
select pg_temp.check(public.accept_team_invite('BARECODE01', '') ->> 'role' = 'tech', 'a bare admin code makes a technician');

-- The account /api/team/join made with a code is the only one that may use it.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into public.team_invites (code, team_id, role) values ('SIGNUP0001', public.my_team_id(), 'tech');
reset role;
update public.team_invites set created_user_id = '00000000-0000-0000-0000-0000000000f9' where code = 'SIGNUP0001';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f6');
select pg_temp.check(pg_temp.fails($$select public.accept_team_invite('SIGNUP0001', '')$$), 'only the account made with a code may use it');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f9');
select pg_temp.check(public.accept_team_invite('SIGNUP0001', '') ->> 'role' = 'tech', 'the account made with the code joins');

-- A used or withdrawn invite stays that way.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
update public.team_invites set used_by = null, used_at = null where code = 'TECHCODE1';
select pg_temp.check((select used_by is not null from public.team_invites where code = 'TECHCODE1'), 'a used invite can''t be made fresh again');
insert into public.team_invites (code, team_id, role) values ('REVOKED01', public.my_team_id(), 'tech');
update public.team_invites set revoked = true where code = 'REVOKED01';
update public.team_invites set revoked = false where code = 'REVOKED01';
select pg_temp.check((select revoked from public.team_invites where code = 'REVOKED01'), 'a withdrawn invite can''t be switched back on');

-- Demoting an admin withdraws the invites they made; removing someone withdraws the ones they made or used.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');
insert into public.team_invites (code, team_id, role) values ('PATCODE01', public.my_team_id(), 'tech');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f5');
insert into public.team_invites (code, team_id, role) values ('MOCODE001', public.my_team_id(), 'tech');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select public.set_team_member_role('00000000-0000-0000-0000-0000000000f3', 'tech');
select pg_temp.check((select revoked from public.team_invites where code = 'PATCODE01'), 'a demoted admin''s invites are withdrawn');
select public.set_team_member_role('00000000-0000-0000-0000-0000000000f3', 'admin');
select public.remove_team_member('00000000-0000-0000-0000-0000000000f5');
select pg_temp.check((select revoked from public.team_invites where code = 'MOCODE001') and (select revoked from public.team_invites where code = 'MAILCODE01'),
  'a removed person''s invites (made and used) are withdrawn');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f5');
select pg_temp.check(pg_temp.fails($$select public.accept_team_invite('MAILCODE01', '')$$), 'a removed admin cannot come back with their code');

-- Starting a company needs a confirmed email.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f8');
select pg_temp.check(pg_temp.error_of($$select public.create_team('Unconfirmed Co', '')$$) like '%Confirm your email%', 'an unconfirmed account cannot start a company');

-- ---------- the catalog is the company's; only the office writes it ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f7');  -- a technician on the team
select pg_temp.check((select count(*) from public.device_types where id = 'tcam') = 1, 'tech reads the company catalog');
update public.device_types set unit_price = 0.01 where id = 'tcam';
select pg_temp.check(pg_temp.fails($$insert into public.device_types (owner_id, id, name, category, unit_price) values ('00000000-0000-0000-0000-0000000000f1', 'tcam', 'Camera', 'security', 0.01)
  on conflict (owner_id, id) do update set unit_price = excluded.unit_price$$), 'tech cannot overwrite the office catalog');
select pg_temp.check(pg_temp.fails($$insert into public.device_types (id, name, category) values ('tnew', 'New', 'security')$$), 'tech cannot add to the catalog');
select pg_temp.check(pg_temp.fails($$insert into public.products (id, device_type_id, brand, model) values ('tp', 'tcam', 'B', 'M')$$), 'tech cannot add products');
update public.projects set product_choices = '{"tcam": "cheap"}' where id = 'tp1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.check((select unit_price from public.device_types where id = 'tcam') = 0, 'the catalog price is unchanged');
select pg_temp.check((select product_choices from public.projects where id = 'tp1') is null, 'tech cannot change a job''s product choices');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f3');  -- an admin: writes go to the company catalog
insert into public.device_types (id, name, category) values ('tspk', 'Speaker', 'audio');
insert into public.products (id, device_type_id, brand, model) values ('tprod', 'tspk', 'B', 'M');
select pg_temp.check((select owner_id from public.device_types where id = 'tspk') = '00000000-0000-0000-0000-0000000000f1', 'an admin''s catalog row belongs to the company');
select pg_temp.check((select owner_id from public.products where id = 'tprod') = '00000000-0000-0000-0000-0000000000f1', 'an admin''s product belongs to the company');
select pg_temp.check(pg_temp.fails($$insert into public.device_types (owner_id, id, name, category) values ('00000000-0000-0000-0000-0000000000f3', 'mine', 'Mine', 'audio')$$),
  'an admin cannot keep a separate catalog of their own');

-- ---------- teams: only the safe columns ----------
select pg_temp.check((select name from public.teams) = 'Acme Low Voltage', 'members read the company name');
select pg_temp.check((select plan_status is not null and owner_id is not null from public.teams), 'members read the plan status and owner');
select pg_temp.check(pg_temp.fails($$select stripe_customer_id from public.teams$$), 'members cannot read the Stripe customer id');
select pg_temp.check(pg_temp.fails($$select stripe_subscription_id from public.teams$$), 'members cannot read the Stripe subscription id');
select pg_temp.check(pg_temp.fails($$select billing_email from public.teams$$), 'members cannot read the billing email');
select pg_temp.check(pg_temp.fails($$select * from public.teams$$), 'select * on teams is refused');
reset role;
\echo TEAM CHECKS PASSED
