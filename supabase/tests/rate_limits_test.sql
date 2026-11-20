-- Rate limit + invite sign-up checks: run after the migrations. Any failed check raises an exception.
\set ON_ERROR_STOP on

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'RATE LIMIT CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;

-- ---------- the server (service role) counts requests ----------
set role service_role;
select pg_temp.check((public.rate_limit_hit('t:a', 600, 3) ->> 'ok')::boolean, 'first hit is allowed');
select pg_temp.check((public.rate_limit_hit('t:a', 600, 3) ->> 'remaining')::int = 1, 'second hit leaves one');
select pg_temp.check((public.rate_limit_hit('t:a', 600, 3) ->> 'ok')::boolean, 'third hit is allowed');
select pg_temp.check(not (public.rate_limit_hit('t:a', 600, 3) ->> 'ok')::boolean, 'fourth hit is refused');
-- (called once in a sub-select: `between` would evaluate the call twice)
select pg_temp.check(r between 1 and 600, 'refusal says when to retry')
  from (select (public.rate_limit_hit('t:a', 600, 3) ->> 'retry_after')::int as r offset 0) x;
select pg_temp.check((public.rate_limit_hit('t:a', 600, 3) ->> 'hits')::int = 6, 'refused hits are counted too');
select pg_temp.check((public.rate_limit_hit('t:b', 600, 3) ->> 'ok')::boolean, 'keys are counted separately');
select pg_temp.check(not (public.rate_limit_hit('t:zero', 60, 0) ->> 'ok')::boolean, 'a limit of 0 refuses everything');
select pg_temp.check(pg_temp.fails($$select public.rate_limit_hit('', 60, 3)$$), 'empty key is refused');
select pg_temp.check(pg_temp.fails($$select public.rate_limit_hit(repeat('x', 201), 60, 3)$$), 'over-long key is refused');
select pg_temp.check((select count(*) from public.rate_limits where key = 't:a') >= 1, 'the service role can read the counts');
reset role;

-- Expired windows are cleaned up eventually: force the cleanup branch by making every row old, then hitting often.
update public.rate_limits set expires_at = now() - interval '1 hour';
do $$ begin for i in 1..1000 loop perform public.rate_limit_hit('t:sweep', 60, 1000000); end loop; end $$;
select pg_temp.check((select count(*) from public.rate_limits where expires_at < now() - interval '1 minute') = 0, 'old windows are swept');

-- ---------- browsers can't use or see it ----------
set role authenticated;
select pg_temp.check(pg_temp.fails($$select public.rate_limit_hit('t:c', 60, 3)$$), 'signed-in users cannot call rate_limit_hit');
select pg_temp.check(pg_temp.fails($$select * from public.rate_limits$$), 'signed-in users cannot read rate_limits');
select pg_temp.check(pg_temp.fails($$delete from public.rate_limits$$), 'signed-in users cannot reset counts');
reset role;
set role anon;
select pg_temp.check(pg_temp.fails($$select public.rate_limit_hit('t:c', 60, 3)$$), 'anon cannot call rate_limit_hit');
select pg_temp.check(pg_temp.fails($$insert into public.rate_limits (key, window_start, expires_at) values ('x', now(), now())$$), 'anon cannot write rate_limits');
reset role;

-- ---------- invite columns ----------
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000ac1', 'rlowner@example.com'),
                                          ('00000000-0000-0000-0000-000000000ac2', 'sam@example.com');
insert into public.teams (id, name, owner_id) values ('00000000-0000-0000-0000-00000000c7c1', 'RL Co', '00000000-0000-0000-0000-000000000ac1');
insert into public.team_invites (code, team_id, email) values ('RLCODE0001', '00000000-0000-0000-0000-00000000c7c1', 'sam@example.com');
select pg_temp.check(pg_temp.fails($$insert into public.team_invites (code, team_id, email) values ('RLCODE0002', '00000000-0000-0000-0000-00000000c7c1', 'Sam@Example.com')$$), 'invite email must be lower case');
select pg_temp.check(pg_temp.fails($$insert into public.team_invites (code, team_id, email) values ('RLCODE0003', '00000000-0000-0000-0000-00000000c7c1', 'nobody')$$), 'invite email must look like an address');
update public.team_invites set created_user_id = '00000000-0000-0000-0000-000000000ac2', signup_claimed_at = now() where code = 'RLCODE0001';
select pg_temp.check((select created_user_id is not null from public.team_invites where code = 'RLCODE0001'), 'invite remembers the account it created');
delete from auth.users where id = '00000000-0000-0000-0000-000000000ac2';
select pg_temp.check((select created_user_id is null from public.team_invites where code = 'RLCODE0001'), 'deleting that account clears the link');

-- The team owner may edit invites, but not the sign-up bookkeeping (clearing it would make one code many accounts).
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000ac3', 'kim@example.com');
update public.team_invites set created_user_id = '00000000-0000-0000-0000-000000000ac3', signup_claimed_at = now() where code = 'RLCODE0001';
insert into public.team_members (team_id, user_id, role, name) values ('00000000-0000-0000-0000-00000000c7c1', '00000000-0000-0000-0000-000000000ac1', 'owner', 'Ro');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000ac1', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set role authenticated;
update public.team_invites set created_user_id = null, signup_claimed_at = null, name = 'Kim' where code = 'RLCODE0001';
insert into public.team_invites (code, team_id, created_user_id, signup_claimed_at)
  values ('RLCODE0004', '00000000-0000-0000-0000-00000000c7c1', '00000000-0000-0000-0000-000000000ac3', now());
reset role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claim.role', '', false);
select pg_temp.check((select name = 'Kim' from public.team_invites where code = 'RLCODE0001'), 'the owner can still edit an invite');
select pg_temp.check((select created_user_id is not null and signup_claimed_at is not null from public.team_invites where code = 'RLCODE0001'),
  'the owner cannot clear the account an invite created');
select pg_temp.check((select created_user_id is null and signup_claimed_at is null from public.team_invites where code = 'RLCODE0004'),
  'the owner cannot set sign-up bookkeeping on a new invite');

select 'rate_limits_test PASSED';
