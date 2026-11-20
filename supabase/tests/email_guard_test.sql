-- Email limits checks (20261124100500_email_guard.sql): run after the migrations (also works inside a transaction that
-- is rolled back). Any failed check raises an exception.
\set ON_ERROR_STOP on
-- Billing enforcement is off until launch (billing_settings.enforce); these checks need it on.
update public.billing_settings set enforce = true;
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
update public.teams set plan_status = 'canceled', trial_ends_at = now() - interval '1 day' where name = 'Guard Lapsed Co';

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

-- ================= 20261124300600_email_signup_abuse.sql =================

-- ---------- one address however it is written (same hash as sendGuard.ts recipientHash) ----------
select pg_temp.check(public.email_normalize(' A.B+promo@GoogleMail.com ') = 'ab@gmail.com', 'gmail: dots and +tag dropped, googlemail read as gmail');
select pg_temp.check(public.email_normalize('Sam+x@Acme.com') = 'sam@acme.com', 'other domains: +tag dropped, dots kept');
select pg_temp.check(public.email_normalize('s.am@acme.com') = 's.am@acme.com', 'dots matter outside gmail');
select pg_temp.check(public.email_hash('a.b+1@gmail.com') = '86ca2ad27318696b41cfc650acfad97bb32194c43e119e465a16359ea74c7105', 'hash matches the server''s (sha256 of ab@gmail.com)');
select pg_temp.check(public.email_hash('') is null and public.email_hash(null) is null, 'no address, no hash');

-- ---------- the platform cap and the trials' share ----------
delete from public.email_sends;
update public.email_settings set daily_platform_cap = 10, trial_share = 0.5, alert_pct = 80, last_alert_at = null;
set role service_role;
select pg_temp.as_service();
do $$
declare i int; r jsonb;
begin
  for i in 1..5 loop
    r := public.email_send_reserve('00000000-0000-0000-0000-00000000e9e1', 'document', pg_temp.h('pc' || i || '@example.com'));
    if not (r ->> 'ok')::boolean then raise exception 'EMAIL GUARD CHECK FAILED: trial platform send % refused: %', i, r; end if;
  end loop;
end $$;
select pg_temp.check((select count(*) from public.email_sends where trial) = 5, 'trial sends are marked as trial');
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000e9e1', 'document', pg_temp.h('pc6@example.com')) ->> 'reason' = 'platform_cap', 'trials together stop at their share of the platform');
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000e9e4', 'document', pg_temp.h('pc7@example.com')) ->> 'reason' = 'platform_cap', 'another trial (solo) is refused too');
select pg_temp.check((public.email_send_reserve('00000000-0000-0000-0000-00000000e9e5', 'document', pg_temp.h('pp1@example.com')) ->> 'ok')::boolean, 'a paying company still sends');
select pg_temp.check(not (public.email_send_reserve('00000000-0000-0000-0000-00000000e9e5', 'document', pg_temp.h('pp2@example.com')) ->> 'platform_alert')::boolean, 'no alert below 80 %');
select pg_temp.check((public.email_send_reserve('00000000-0000-0000-0000-00000000e9e5', 'document', pg_temp.h('pp3@example.com')) ->> 'platform_alert')::boolean, 'the send that reaches 80 % raises the alert');
select pg_temp.check(not (public.email_send_reserve('00000000-0000-0000-0000-00000000e9e5', 'document', pg_temp.h('pp4@example.com')) ->> 'platform_alert')::boolean, 'once a day');
select pg_temp.check(public.email_send_log('00000000-0000-0000-0000-00000000e9e1', 'notify', pg_temp.h('eowner@example.com')) is not null, 'notifications are logged (and count towards the platform)');
select pg_temp.check(public.email_send_reserve('00000000-0000-0000-0000-00000000e9e5', 'document', pg_temp.h('pp5@example.com')) ->> 'reason' = 'platform_cap', 'nobody sends past the platform cap');
update public.email_sends set created_at = now() - interval '25 hours';
select pg_temp.check((public.email_send_reserve('00000000-0000-0000-0000-00000000e9e1', 'document', pg_temp.h('pc8@example.com')) ->> 'ok')::boolean, 'the platform window rolls over');
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000e9e1');
select pg_temp.check(pg_temp.fails($$select * from public.email_settings$$), 'members cannot read the email settings');
select pg_temp.check(pg_temp.fails($$update public.email_settings set daily_platform_cap = 1000000$$), 'members cannot raise the platform cap');
reset role;
-- A team that cancelled during its trial still works for free: it counts as a trial.
delete from public.email_sends;
update public.email_settings set daily_platform_cap = 10, trial_share = 0;
update public.teams set plan_status = 'canceled', trial_ends_at = now() + interval '5 days'
  where id = (select team_id from public.team_members where user_id = '00000000-0000-0000-0000-00000000e9e5');
set role service_role;
select pg_temp.as_service();
select pg_temp.check((select r ->> 'reason' = 'platform_cap' and (r ->> 'trial')::boolean
                      from public.email_send_reserve('00000000-0000-0000-0000-00000000e9e5', 'document', pg_temp.h('pcx@example.com')) r),
  'a team cancelled during its trial gets the trial share, not a paying company''s');
reset role;
update public.teams set plan_status = 'active', trial_ends_at = null
  where id = (select team_id from public.team_members where user_id = '00000000-0000-0000-0000-00000000e9e5');
delete from public.email_sends;
update public.email_settings set daily_platform_cap = 2000, trial_share = 0.3, last_alert_at = null;

-- ---------- one trial per address ----------
-- The address already had an account (deleted since): a new account with the same mailbox doesn't start a fresh trial.
update public.billing_settings set launched_at = now() - interval '60 days';
insert into public.used_trials (email_hash, first_trial_at) values (public.email_hash('farmer@gmail.com'), now() - interval '30 days');
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000e9f1', 'Far.Mer+2@gmail.com', now()),
  ('00000000-0000-0000-0000-00000000e9f2', 'newcomer@example.com', now());
select pg_temp.check((select first_trial_at < now() - interval '29 days' from public.used_trials where email_hash = public.email_hash('farmer@gmail.com')), 'a new sign-up keeps the first trial date');
select pg_temp.check(exists (select 1 from public.used_trials where email_hash = public.email_hash('newcomer@example.com')), 'sign-up records the address as having had its trial');
select pg_temp.check(public.solo_trial_ends_at('00000000-0000-0000-0000-00000000e9f1') < now(), 'the re-made account''s personal trial is already over');
select pg_temp.check(public.solo_trial_ends_at('00000000-0000-0000-0000-00000000e9f2') > now() + interval '13 days', 'a new address gets 14 days');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000e9f1');
select pg_temp.check(public.create_team('Farm Co', 'F') is not null, 'the farmer starts a team');
select pg_temp.check((public.team_billing() ->> 'trial_ends_at')::timestamptz < now(), 'and it gets no fresh trial');
select pg_temp.as_user('00000000-0000-0000-0000-00000000e9f2');
select pg_temp.check(public.create_team('New Co', 'N') is not null, 'a newcomer starts a team');
select pg_temp.check((public.team_billing() ->> 'trial_ends_at')::timestamptz > now() + interval '13 days', 'a newcomer''s team gets the trial');
select pg_temp.check(pg_temp.fails($$select count(*) from public.used_trials$$), 'members cannot read the used trials');
reset role;
-- Deleting the account keeps the record (no foreign key).
delete from public.team_members where user_id = '00000000-0000-0000-0000-00000000e9f2';
delete from public.teams where owner_id = '00000000-0000-0000-0000-00000000e9f2';
delete from public.billing_trials where user_id = '00000000-0000-0000-0000-00000000e9f2';
delete from auth.users where id = '00000000-0000-0000-0000-00000000e9f2';
select pg_temp.check(exists (select 1 from public.used_trials where email_hash = public.email_hash('newcomer@example.com')), 'a deleted account''s trial stays used');

-- ---------- terms record ----------
alter table auth.users add column if not exists raw_user_meta_data jsonb;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000e9f3', 'terms@example.com', '{"terms_version": "2026-11", "terms_accepted_at": "2020-01-01T00:00:00Z"}'),
  ('00000000-0000-0000-0000-00000000e9f4', 'noterms@example.com', '{"name": "No"}'),
  ('00000000-0000-0000-0000-00000000e9f5', 'junkterms@example.com', '{"terms_version": "<script>"}');
select pg_temp.check((select version = '2026-11' and accepted_at > now() - interval '1 minute' from public.terms_acceptances where user_id = '00000000-0000-0000-0000-00000000e9f3'),
  'terms ticked at sign-up are recorded, at the database''s time');
select pg_temp.check(not exists (select 1 from public.terms_acceptances where user_id = '00000000-0000-0000-0000-00000000e9f4'), 'no terms, no record');
select pg_temp.check((select version from public.terms_acceptances where user_id = '00000000-0000-0000-0000-00000000e9f5') = 'unknown', 'a junk version is not stored as given');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000e9f4');
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "TestBrowser/1"}', false);
select public.accept_terms('2026-12');
select pg_temp.check((select ip = '203.0.113.9' and user_agent = 'TestBrowser/1' and version = '2026-12' from public.terms_acceptances where user_id = auth.uid()),
  'accept_terms records the version, address and browser');
select pg_temp.check(pg_temp.fails($$select public.accept_terms('bad version!')$$), 'a junk version is refused');
select public.accept_terms('2026-12');
select pg_temp.check((select count(*) from public.terms_acceptances where user_id = auth.uid() and version = '2026-12') = 1, 'accepting the same version again adds no row');
select pg_temp.check((select count(*) from public.terms_acceptances) = 1, 'people see only their own record');
select pg_temp.check(pg_temp.fails($$insert into public.terms_acceptances (user_id, version) values (auth.uid(), 'x')$$), 'no direct inserts');
select pg_temp.check(pg_temp.fails($$update public.terms_acceptances set version = 'x'$$), 'no updates');
select pg_temp.check(pg_temp.fails($$delete from public.terms_acceptances$$), 'no deletes');
reset role;
set role anon;
select pg_temp.check(pg_temp.fails($$select public.accept_terms('2026-12')$$), 'signed-out callers cannot accept terms');
reset role;
set role service_role;
select pg_temp.check(pg_temp.fails($$update public.terms_acceptances set version = 'x'$$), 'not even the server can change the record');
select pg_temp.check(pg_temp.fails($$delete from public.terms_acceptances$$), 'or remove it');
reset role;
select set_config('request.headers', '', false);
select 'EMAIL GUARD TESTS PASSED';
