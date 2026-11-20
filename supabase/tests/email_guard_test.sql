-- Email limits checks (20261124100500_email_guard.sql): run after the migrations (also works inside a transaction that
-- is rolled back). Any failed check raises an exception.
\set ON_ERROR_STOP on
-- Supabase's auth.users has this column; the test stand-in doesn't.
alter table auth.users add column if not exists email_confirmed_at timestamptz;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000e9e1', 'eowner@example.com', now()),
  ('00000000-0000-0000-0000-00000000e9e2', 'eadmin@example.com', now()),
  ('00000000-0000-0000-0000-00000000e9e3', 'enew@example.com', null),
  ('00000000-0000-0000-0000-00000000e9e4', 'esolo@example.com', now()),
  ('00000000-0000-0000-0000-00000000e9e5', 'epaid@example.com', now()),
  ('00000000-0000-0000-0000-00000000e9e6', 'elapsed@example.com', now());

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'EMAIL GUARD CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
create function pg_temp.h(s text) returns text language sql as $$ select md5(s) || md5(s) $$;

-- ---------- companies: a trial team (owner + admin), a paying team, a lapsed team, a solo account ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000e9e1');
select pg_temp.check(public.create_team('Guard Trial Co', 'Erin') is not null, 'trial owner creates a team');
insert into public.team_invites (code, team_id, role, name) values ('EGUARDADM1', public.my_team_id(), 'admin', 'Ed');
insert into public.projects (id, client_name, address, status) values ('egp1', 'Client', '1 Guard St', 'estimate');
select pg_temp.as_user('00000000-0000-0000-0000-00000000e9e2');
select pg_temp.check(public.accept_team_invite('EGUARDADM1', '') ->> 'role' = 'admin', 'admin joins');
select pg_temp.as_user('00000000-0000-0000-0000-00000000e9e5');
select pg_temp.check(public.create_team('Guard Paid Co', 'Pat') is not null, 'paid owner creates a team');
select pg_temp.as_user('00000000-0000-0000-0000-00000000e9e6');
select pg_temp.check(public.create_team('Guard Lapsed Co', 'Lee') is not null, 'lapsed owner creates a team');

-- ---------- the apps can't see or use any of it ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000e9e1');
select pg_temp.check(pg_temp.fails($$select public.email_send_reserve('00000000-0000-0000-0000-00000000e9e1', 'document', md5('x') || md5('x'))$$), 'members cannot reserve sends');
select pg_temp.check(pg_temp.fails($$select public.email_send_log('00000000-0000-0000-0000-00000000e9e1', 'notify', md5('x') || md5('x'))$$), 'members cannot log sends');
select pg_temp.check(pg_temp.fails($$select public.answer_rate_hit('ip:abcdefgh', 60, 5)$$), 'members cannot use the answer limit');
select pg_temp.check(pg_temp.fails($$select count(*) from public.email_sends$$), 'members cannot read the send log');
select pg_temp.check(pg_temp.fails($$insert into public.email_sends (kind, recipient_hash) values ('notify', md5('x'))$$), 'members cannot write the send log');
select pg_temp.check(pg_temp.fails($$select count(*) from public.answer_rate_hits$$), 'members cannot read answer hits');
reset role;
set role anon;
select pg_temp.check(pg_temp.fails($$select public.email_send_reserve('00000000-0000-0000-0000-00000000e9e1', 'document', md5('x') || md5('x'))$$), 'anon cannot reserve sends');
select pg_temp.check(pg_temp.fails($$select count(*) from public.email_sends$$), 'anon cannot read the send log');
reset role;

-- The server's billing webhook: one team pays, one lapses.
update public.teams set plan_status = 'active' where name = 'Guard Paid Co';
update public.teams set plan_status = 'canceled' where name = 'Guard Lapsed Co';

set role service_role;
select pg_temp.as_service();

-- ---------- refusals ----------
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000e9e3', 'document', pg_temp.h('a@example.com')) ->> 'reason' = 'unconfirmed', 'an unconfirmed email cannot send');
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000e9e6', 'document', pg_temp.h('a@example.com')) ->> 'reason' = 'plan_inactive', 'a lapsed company cannot send');
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000e9e6', 'invite', pg_temp.h('a@example.com')) ->> 'reason' = 'plan_inactive', 'a lapsed company cannot invite');
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000e9e1', 'spam', pg_temp.h('a@example.com')) ->> 'reason' = 'bad_kind', 'unknown kinds are refused');
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000e9e1', 'notify', pg_temp.h('a@example.com')) ->> 'reason' = 'bad_kind', 'notifications are logged, not reserved');
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000ffff', 'document', pg_temp.h('a@example.com')) ->> 'reason' = 'no_user', 'unknown users are refused');
select pg_temp.check((select count(*) from public.email_sends) = 0, 'refusals write nothing');

-- ---------- a trial company: 20 documents a day, shared by everyone on the team ----------
select pg_temp.check((public.email_send_reserve('00000000-0000-0000-0000-00000000e9e1', 'document', pg_temp.h('c1@example.com')) ->> 'trial')::boolean, 'a trial is reported as a trial');
do $$
declare i int; r jsonb;
begin
  for i in 2..20 loop
    r := public.email_send_reserve(case when i % 2 = 0 then '00000000-0000-0000-0000-00000000e9e2' else '00000000-0000-0000-0000-00000000e9e1' end::uuid,
                                   (array['document', 'reminder', 'receipt'])[1 + i % 3], pg_temp.h('c' || i || '@example.com'));
    if not (r ->> 'ok')::boolean then raise exception 'EMAIL GUARD CHECK FAILED: send % refused: %', i, r; end if;
  end loop;
end $$;
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000e9e2', 'document', pg_temp.h('c21@example.com')) ->> 'reason' = 'daily_cap', 'the 21st document of the day is refused (team-wide)');
select pg_temp.check((public.email_send_reserve('00000000-0000-0000-0000-00000000e9e1', 'invite', pg_temp.h('crew@example.com')) ->> 'ok')::boolean, 'invites have their own allowance');
select pg_temp.check((select team_id from public.email_sends order by id desc limit 1) = (select id from public.teams where name = 'Guard Trial Co'), 'sends are logged against the company');
select pg_temp.check((select user_id from public.email_sends order by id desc limit 1) = '00000000-0000-0000-0000-00000000e9e1', 'and the person who sent them');

-- A send from yesterday doesn't count.
update public.email_sends set created_at = now() - interval '25 hours'
  where id = (select min(id) from public.email_sends where kind in ('document', 'reminder', 'receipt'));
select pg_temp.check((public.email_send_reserve('00000000-0000-0000-0000-00000000e9e1', 'document', pg_temp.h('c22@example.com')) ->> 'ok')::boolean, 'the window rolls over after 24 hours');

-- ---------- invites capped at 10 a day on a trial ----------
do $$
declare i int; r jsonb;
begin
  for i in 2..10 loop
    r := public.email_send_reserve('00000000-0000-0000-0000-00000000e9e1', 'invite', pg_temp.h('crew' || i || '@example.com'));
    if not (r ->> 'ok')::boolean then raise exception 'EMAIL GUARD CHECK FAILED: invite % refused: %', i, r; end if;
  end loop;
end $$;
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000e9e1', 'invite', pg_temp.h('crew11@example.com')) ->> 'reason' = 'daily_cap', 'the 11th invite of the day is refused');

-- ---------- one address can't be bombarded ----------
do $$
declare i int; r jsonb;
begin
  for i in 1..25 loop
    r := public.email_send_reserve('00000000-0000-0000-0000-00000000e9e5', 'document', pg_temp.h('same@example.com'));
    if not (r ->> 'ok')::boolean then raise exception 'EMAIL GUARD CHECK FAILED: paid send % refused: %', i, r; end if;
  end loop;
end $$;
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000e9e5', 'reminder', pg_temp.h('same@example.com')) ->> 'reason' = 'recipient_cap', 'the same address 26 times in a day is refused');
select pg_temp.check(not (public.email_send_reserve('00000000-0000-0000-0000-00000000e9e5', 'document', pg_temp.h('other@example.com')) ->> 'trial')::boolean, 'a paying company is not a trial');
select pg_temp.check((public.email_send_reserve('00000000-0000-0000-0000-00000000e9e5', 'document', pg_temp.h('other@example.com')) ->> 'cap')::int = 300, 'paying companies get the bigger allowance');

-- ---------- solo accounts count as a trial, on their own ----------
do $$
declare i int; r jsonb;
begin
  for i in 1..5 loop
    r := public.email_send_reserve('00000000-0000-0000-0000-00000000e9e4', 'document', pg_temp.h('solo-client@example.com'));
    if not (r ->> 'ok')::boolean or not (r ->> 'trial')::boolean then raise exception 'EMAIL GUARD CHECK FAILED: solo send % : %', i, r; end if;
  end loop;
end $$;
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000e9e4', 'document', pg_temp.h('solo-client@example.com')) ->> 'reason' = 'recipient_cap', 'a trial reaches one address at most 5 times a day');

-- ---------- notifications are logged against the job owner's company ----------
select pg_temp.check(public.email_send_log('00000000-0000-0000-0000-00000000e9e1', 'notify', pg_temp.h('eowner@example.com'), 're_123') is not null, 'the server logs a notification');
select pg_temp.check((select team_id = (select id from public.teams where name = 'Guard Trial Co') and user_id is null and resend_id = 're_123'
                      from public.email_sends order by id desc limit 1), 'the notification row has the company and Resend id');

-- ---------- answer page limits ----------
select pg_temp.check(public.answer_rate_hit('ip:test-key-1', 3600, 3), 'hit 1 allowed');
select pg_temp.check(public.answer_rate_hit('ip:test-key-1', 3600, 3), 'hit 2 allowed');
select pg_temp.check(public.answer_rate_hit('ip:test-key-1', 3600, 3), 'hit 3 allowed');
select pg_temp.check(not public.answer_rate_hit('ip:test-key-1', 3600, 3), 'hit 4 refused');
select pg_temp.check(public.answer_rate_hit('ip:test-key-2', 3600, 3), 'other keys are separate');
update public.answer_rate_hits set created_at = now() - interval '2 hours' where key = 'ip:test-key-1';
select pg_temp.check(public.answer_rate_hit('ip:test-key-1', 3600, 3), 'the window rolls over');
select pg_temp.check(not public.answer_rate_hit('short', 3600, 3), 'junk keys are refused');
select pg_temp.check(not public.answer_rate_hit('ip:test-key-3', 700000, 3), 'windows over a week are refused');

-- ---------- the notification stamp is the server's ----------
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000e9e1');
insert into public.rfis (id, project_id, number, subject, status) values ('egr1', 'egp1', 1, 'Mount height?', 'open');
insert into public.change_orders (id, project_id, number, title, status) values ('egc1', 'egp1', 1, 'Extra camera', 'sent');
update public.rfis set response_notified_at = now() where id = 'egr1';
update public.change_orders set response_notified_at = now() where id = 'egc1';
select pg_temp.check((select response_notified_at is null from public.rfis where id = 'egr1'), 'the apps cannot stamp an RFI as notified');
select pg_temp.check((select response_notified_at is null from public.change_orders where id = 'egc1'), 'the apps cannot stamp a change order as notified');
reset role;
set role service_role;
select pg_temp.as_service();
update public.rfis set response_notified_at = now() where id = 'egr1' and response_notified_at is null;
select pg_temp.check((select response_notified_at is not null from public.rfis where id = 'egr1'), 'the server stamps it');
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000e9e1');
update public.rfis set response_notified_at = null, subject = 'Mount height? (edited)' where id = 'egr1';
select pg_temp.check((select response_notified_at is not null and subject = 'Mount height? (edited)' from public.rfis where id = 'egr1'), 'the apps cannot clear it either, other edits still land');

reset role;
select 'EMAIL GUARD TESTS PASSED';
