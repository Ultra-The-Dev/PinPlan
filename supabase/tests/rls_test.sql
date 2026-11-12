-- RLS checks: run after supabase_stubs.sql and the migrations. Any failed check raises an exception.
\set ON_ERROR_STOP on
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
                              ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
                              ('00000000-0000-0000-0000-00000000000c', 'c@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'RLS CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;

-- User A creates a project with a sheet and a marker.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.projects (id, client_name, address, status) values ('p1', 'Client', '20 Hilltop Dr E', 'estimate');
insert into public.sheets (id, project_id, name, page_number, sort_order, image_id, width, height) values ('s1', 'p1', 'Attic', 1, 0, 'img1', 1000, 800);
insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, label, room, mount, wire_type, tentative, notes)
  values ('m1', 'p1', 's1', 'cam-indoor', 0.5, 0.5, 'CAM-1-01', '', 'ceiling', 'Cat6', false, '');
select pg_temp.check((select count(*) from public.projects) = 1, 'owner sees own project');
select pg_temp.check((select count(*) from public.project_members where project_id = 'p1') = 1, 'owner auto-added as member');
select pg_temp.check((select count(*) from public.markers) = 1, 'owner sees own markers');

-- User B sees nothing and cannot write into A's project.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from public.projects) = 0, 'other user cannot see project');
select pg_temp.check((select count(*) from public.markers) = 0, 'other user cannot see markers');
do $$ begin
  insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, label, room, mount, wire_type, tentative, notes)
    values ('m2', 'p1', 's1', 'cam-indoor', 0.1, 0.1, 'X', '', 'ceiling', 'Cat6', false, '');
  raise exception 'RLS CHECK FAILED: other user could insert a marker';
exception when insufficient_privilege then raise notice 'ok: other user cannot insert markers';
end $$;
update public.projects set address = 'hacked' where id = 'p1';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select address from public.projects where id = 'p1') = '20 Hilltop Dr E', 'other user cannot update project');

-- A shares the project with C; C can now read and add markers.
insert into public.project_members (project_id, user_id, role) values ('p1', '00000000-0000-0000-0000-00000000000c', 'editor');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from public.projects) = 1, 'member sees shared project');
insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, label, room, mount, wire_type, tentative, notes)
  values ('m3', 'p1', 's1', 'wap', 0.2, 0.2, 'WAP-1-01', '', 'ceiling', 'Cat6', false, '');
select pg_temp.check((select count(*) from public.markers) = 2, 'member can add markers');

-- Positions must stay within the sheet.
do $$ begin
  insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, label, room, mount, wire_type, tentative, notes)
    values ('m4', 'p1', 's1', 'wap', 1.5, 0.2, 'BAD', '', 'ceiling', 'Cat6', false, '');
  raise exception 'RLS CHECK FAILED: out-of-range marker accepted';
exception when check_violation then raise notice 'ok: marker x/y constrained to 0..1';
end $$;

-- Storage: member can read plan images under the project folder; non-member can't.
reset role;
insert into storage.objects (bucket_id, name) values ('plans', 'p1/img1');
set role authenticated;
select pg_temp.check((select count(*) from storage.objects) = 1, 'member can read project plan image');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from storage.objects) = 0, 'non-member cannot read plan image');

-- Catalog is per owner.
insert into public.device_types (id, name, category, symbol, abbrev, shape, color, unit, unit_price, labor_price, default_wire, default_mount, kind, sort_order)
  values ('cam-indoor', 'Indoor camera', 'security', 'C', 'CAM', 'circle', '#dc2626', 'each', 199, 80, 'Cat6', 'ceiling', 'device', 0);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.device_types) = 0, 'catalog rows are private to their owner');

-- Secrets table is invisible to signed-in users and anon.
do $$ begin
  perform * from public.app_secrets;
  raise exception 'RLS CHECK FAILED: authenticated user can read app_secrets';
exception when insufficient_privilege then raise notice 'ok: app_secrets not readable by users';
end $$;
reset role;
set role service_role;
insert into public.app_secrets (name, payload) values ('billdu', 'enc') on conflict (name) do update set payload = excluded.payload;
select pg_temp.check((select count(*) from public.app_secrets) = 1, 'service role can use app_secrets');
reset role;
\echo ALL RLS CHECKS PASSED
