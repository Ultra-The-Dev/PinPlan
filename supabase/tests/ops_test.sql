-- Ops checks: app_errors flood caps, size clamp, server reports, schema_version(). Run after the migrations.
-- Any failed check raises an exception.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000ee1', 'err1@example.com'),
                                          ('00000000-0000-0000-0000-000000000ee2', 'err2@example.com');

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'OPS CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
create function pg_temp.as_anon(ip text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, false);
  perform set_config('request.jwt.claim.role', 'anon', false);
  perform set_config('request.headers', case when ip is null then '{}' else json_build_object('x-forwarded-for', ip || ', 10.0.0.1')::text end, false);
end $$;
create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.headers', '{}', false);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.headers', '{}', false);
end $$;
-- n reports through the API role (insert as that role, like PostgREST does).
create function pg_temp.flood(n int, platform text default 'web', msg text default 'boom') returns void language plpgsql as $$
begin
  for i in 1..n loop
    insert into public.app_errors (message, platform) values (msg || ' ' || i, platform);
  end loop;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

delete from public.app_errors;

-- One signed-out device is capped at 10 per 5 minutes; another device still gets through.
select pg_temp.as_anon('203.0.113.7');
set role anon;
select pg_temp.flood(15);
select pg_temp.check(pg_temp.fails('select count(*) from public.app_errors'), 'anon cannot read error reports');
reset role;
select pg_temp.check((select count(*) from public.app_errors) = 10, 'one signed-out device capped at 10');
select pg_temp.check((select count(distinct client_key) from public.app_errors) = 1 and (select client_key from public.app_errors limit 1) !~ '203\.0\.113', 'device key is a hash, not the address');
select pg_temp.as_anon('198.51.100.9');
set role anon;
select pg_temp.flood(5);
reset role;
select pg_temp.check((select count(*) from public.app_errors) = 15, 'a second device is not blocked by the first');

-- All signed-out reports together are capped at 100 (requests without an address only hit this cap).
select pg_temp.as_anon(null);
set role anon;
select pg_temp.flood(150);
reset role;
select pg_temp.check((select count(*) from public.app_errors where user_id is null) = 100, 'anon flood capped at 100 in total');

-- Signed-in users have their own cap (20) and are not blocked by the anon flood.
select pg_temp.as_user('00000000-0000-0000-0000-000000000ee1');
set role authenticated;
select pg_temp.flood(30);
reset role;
select pg_temp.check((select count(*) from public.app_errors where user_id = '00000000-0000-0000-0000-000000000ee1') = 20, 'one user capped at 20');

-- Nobody but the server can file server reports.
select pg_temp.as_anon('192.0.2.1');
set role anon;
select pg_temp.flood(3, 'server');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000ee2');
set role authenticated;
select pg_temp.flood(3, 'server');
-- … and nobody can report as someone else.
insert into public.app_errors (message, platform, user_id) values ('spoof', 'web', '00000000-0000-0000-0000-000000000ee1');
reset role;
select pg_temp.check((select count(*) from public.app_errors where platform = 'server') = 0, 'apps cannot claim to be the server');
select pg_temp.check((select user_id from public.app_errors where message = 'spoof') = '00000000-0000-0000-0000-000000000ee2', 'user_id comes from the token');

-- Size clamp: long fields are cut, not rejected; huge context is replaced.
set role authenticated;
insert into public.app_errors (message, stack, url, user_agent, context, platform)
values (repeat('m', 1900), repeat('s', 15000), repeat('u', 1900), repeat('a', 500),
        jsonb_build_object('big', repeat('x', 6000)), 'web');
reset role;
select pg_temp.check((select char_length(message) = 1000 and char_length(stack) = 8000 and char_length(url) = 1000 and char_length(user_agent) = 256
                      and context = '{"truncated": true}'::jsonb
                      from public.app_errors where message like 'mmm%'), 'long fields clamped');

-- Fill the global app cap (300) with signed-in reports from many users …
reset role;
insert into auth.users (id, email) select ('00000000-0000-0000-0000-000ee00f' || lpad(g::text, 4, '0'))::uuid, 'flood' || g || '@example.com' from generate_series(1, 20) g;
do $$ begin
  for g in 1..20 loop
    perform pg_temp.as_user('00000000-0000-0000-0000-000ee00f' || lpad(g::text, 4, '0'));
    set local role authenticated;
    perform pg_temp.flood(20);
    reset role;
  end loop;
end $$;
select pg_temp.check((select count(*) from public.app_errors where platform is distinct from 'server') = 300, 'all app reports capped at 300');

-- … the server still gets its reports in (own cap of 100), and may name the user.
select pg_temp.as_service();
set role service_role;
select pg_temp.flood(3, 'server', 'server boom');
insert into public.app_errors (message, platform, user_id) values ('account delete failed', 'server', '00000000-0000-0000-0000-000000000ee1');
select pg_temp.flood(120, 'server', 'server flood');
reset role;
select pg_temp.check((select count(*) from public.app_errors where message like 'server boom%') = 3, 'server reports are not silenced by an app flood');
select pg_temp.check((select user_id from public.app_errors where message = 'account delete failed') = '00000000-0000-0000-0000-000000000ee1', 'server may attach the user');
select pg_temp.check((select count(*) from public.app_errors where platform = 'server') = 100, 'server reports capped at 100');

-- schema_version(): anyone can call it; it names this migration (or a newer one).
select pg_temp.as_anon(null);
set role anon;
select pg_temp.check(left(public.schema_version(), 14) >= '20261124100800', 'anon can call schema_version()');
reset role;
select pg_temp.check(public.schema_version() ~ '^\d{14}_[a-z0-9_]+$', 'schema_version() is <version>_<name>');

delete from public.app_errors;
select 'OPS TESTS PASSED';
