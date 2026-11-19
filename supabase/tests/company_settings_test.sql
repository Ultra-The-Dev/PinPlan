-- Company settings checks: run after the migrations. Any failed check raises an exception.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'cowner@example.com'),
                                          ('00000000-0000-0000-0000-0000000000c2', 'ctech@example.com'),
                                          ('00000000-0000-0000-0000-0000000000c3', 'coffice@example.com'),
                                          ('00000000-0000-0000-0000-0000000000c4', 'coutsider@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '{"role": "anon"}', false);
  perform set_config('request.jwt.claim.role', 'anon', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'COMPANY SETTINGS CHECK FAILED: %', what; end if;
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

-- ---------- a company: owner, office admin, technician ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check(public.create_team('Settings Co', 'Olivia') is not null, 'owner creates a team');
insert into public.team_invites (code, team_id, role, name) values ('CSTECH0001', public.my_team_id(), 'tech', 'Tom'), ('CSOFFICE01', public.my_team_id(), 'admin', 'Ann');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check(public.accept_team_invite('CSTECH0001', '') ->> 'role' = 'tech', 'tech joins');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check(public.accept_team_invite('CSOFFICE01', '') ->> 'role' = 'admin', 'admin joins');

-- ---------- the owner writes, everyone on the team reads ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.company_settings (owner_id, business_name, phone, address, terms, logo_image_id)
  values (public.my_billing_owner(), 'Settings Co', '555-0100', '1 Main St', 'Net 30', 'img1');
select pg_temp.check((select updated_by from public.company_settings) = '00000000-0000-0000-0000-0000000000c1', 'the database stamps who saved it');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check((select business_name from public.company_settings) = 'Settings Co', 'admin reads the company row');
update public.company_settings set phone = '555-0199', updated_at = now() where owner_id = public.my_billing_owner();
select pg_temp.check((select phone from public.company_settings) = '555-0199', 'admin updates it');
select pg_temp.check((select updated_by from public.company_settings) = '00000000-0000-0000-0000-0000000000c3', 'updated_by follows the editor');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check((select business_name from public.company_settings) = 'Settings Co', 'tech reads the company row');
update public.company_settings set business_name = 'Hacked' where owner_id = public.my_billing_owner();
select pg_temp.check((select business_name from public.company_settings) = 'Settings Co', 'tech cannot update it');
select pg_temp.check(pg_temp.fails($q$insert into public.company_settings (owner_id, business_name) values ('00000000-0000-0000-0000-0000000000c2', 'Mine')$q$), 'tech cannot insert a row');
delete from public.company_settings;
select pg_temp.check((select count(*) from public.company_settings) = 1, 'tech cannot delete it');

-- ---------- outsiders and the public see nothing ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
select pg_temp.check((select count(*) from public.company_settings) = 0, 'outsider cannot read another company');
update public.company_settings set business_name = 'Hacked';
select pg_temp.check(pg_temp.fails($q$insert into public.company_settings (owner_id, business_name) values ('00000000-0000-0000-0000-0000000000c1', 'Hijack') on conflict (owner_id) do update set business_name = 'Hijack'$q$), 'outsider cannot write the company row');
insert into public.company_settings (owner_id, business_name) values (public.my_billing_owner(), 'Solo Shop');
select pg_temp.check((select business_name from public.company_settings) = 'Solo Shop', 'someone working alone keeps their own row');
reset role;
select pg_temp.check((select business_name from public.company_settings where owner_id = '00000000-0000-0000-0000-0000000000c1') = 'Settings Co', 'the company row is unchanged');
set role anon;
select pg_temp.as_anon();
select pg_temp.check(pg_temp.fails('select count(*) from public.company_settings'), 'anon cannot read it at all');
reset role;

select pg_temp.check(pg_temp.fails($q$insert into public.company_settings (owner_id, phone) values ('00000000-0000-0000-0000-0000000000c3', repeat('9', 61))$q$), 'lengths are capped');

select 'COMPANY SETTINGS TESTS PASSED';
