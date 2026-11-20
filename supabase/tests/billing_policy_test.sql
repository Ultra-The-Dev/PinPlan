-- Billing policy checks (20261124100200_billing_policy.sql): solo trial, enforce switch, one trial per owner,
-- comp list, canceled within the trial, cancel_at. Run after the migrations. Any failed check raises an exception.
\set ON_ERROR_STOP on
insert into auth.users (id, email, created_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'early@example.com', now() - interval '1 year'),   -- signed up before launch
  ('00000000-0000-0000-0000-0000000000c2', 'lapsed@example.com', now() - interval '20 days'), -- personal trial over
  ('00000000-0000-0000-0000-0000000000c3', 'fresh@example.com', now() - interval '2 days'),   -- personal trial running
  ('00000000-0000-0000-0000-0000000000c4', 'again@example.com', now() - interval '2 days'),   -- starts two teams
  ('00000000-0000-0000-0000-0000000000c5', 'comp@example.com', now() - interval '2 days');    -- on the comp list
-- Launch happened 30 days ago (the users above sign up around it).
update public.billing_settings set launched_at = now() - interval '30 days', enforce = true,
  comp_owner_ids = array['00000000-0000-0000-0000-0000000000c5']::uuid[];

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
  if not ok then raise exception 'BILLING POLICY CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.error_of(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;

-- plan_allows_work, straight (enforced).
select pg_temp.check(public.plan_allows_work('canceled', now() + interval '3 days'), 'canceled within the trial may work');
select pg_temp.check(not public.plan_allows_work('canceled', now() - interval '1 minute'), 'canceled after the trial may not');
select pg_temp.check(not public.plan_allows_work('canceled', null), 'canceled with no trial may not');
select pg_temp.check(public.plan_allows_work('incomplete', now() + interval '3 days'), 'incomplete within the trial may work');
select pg_temp.check(not public.plan_allows_work('incomplete', now() - interval '1 minute'), 'incomplete after the trial may not');
select pg_temp.check(not public.plan_allows_work('trialing', now() - interval '1 minute'), 'expired trial may not (enforced)');
select pg_temp.check(not public.plan_allows_work('unpaid', now() + interval '3 days'), 'unpaid may not, even within the trial');

set role authenticated;

-- A solo account from before launch keeps working.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check(public.solo_billing() ->> 'trial_ends_at' is null, 'pre-launch solo: no trial deadline');
select pg_temp.check((public.solo_billing() ->> 'can_work')::boolean, 'pre-launch solo can work');
insert into public.projects (id, client_name, address, status) values ('cp1', 'Client', '1 Early St', 'estimate');
insert into public.sheets (id, project_id, name, page_number, sort_order, image_id, width, height) values ('cs1', 'cp1', 'Main', 1, 0, 'cimg1', 1000, 800);
insert into public.device_types (id, name, category) values ('ccam', 'Camera', 'security');
insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, label, room, mount, wire_type, tentative, notes)
  values ('cm1', 'cp1', 'cs1', 'ccam', 0.5, 0.5, 'CAM-1', '', 'ceiling', 'Cat6', false, '');
select pg_temp.check((select count(*) from public.markers where id = 'cm1') = 1, 'pre-launch solo adds a device');

-- A solo account inside its personal trial works.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select pg_temp.check((public.solo_billing() ->> 'trial_ends_at')::timestamptz between now() + interval '11 days 23 hours' and now() + interval '12 days 1 hour', 'fresh solo: trial is sign-up + 14 days');
insert into public.projects (id, client_name, address, status) values ('cp3', 'Client', '3 Fresh St', 'estimate');
select pg_temp.check((select count(*) from public.projects where id = 'cp3') = 1, 'solo within the personal trial adds a job');

-- A solo account past its personal trial is read-only.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check(not (public.solo_billing() ->> 'can_work')::boolean, 'lapsed solo cannot work');
select pg_temp.check(public.team_billing() is null, 'lapsed solo has no team billing');
select pg_temp.check(pg_temp.error_of($$insert into public.projects (id, client_name, address, status) values ('cp2', 'C', 'A', 'estimate')$$) = 'PinPlan subscription inactive', 'lapsed solo: new job refused');
-- Their job from before (written by support) is readable, but devices can't be added.
reset role;
insert into public.projects (id, owner_id, client_name, address, status) values ('cp2', '00000000-0000-0000-0000-0000000000c2', 'C', 'A', 'estimate');
insert into public.sheets (id, project_id, name, page_number, sort_order, image_id, width, height) values ('cs2', 'cp2', 'Main', 1, 0, 'cimg2', 1000, 800);
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check((select count(*) from public.projects where id = 'cp2') = 1, 'lapsed solo still reads their job');
select pg_temp.check(pg_temp.error_of($$insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, label, room, mount, wire_type, tentative, notes)
  values ('cm2', 'cp2', 'cs2', 'ccam', 0.5, 0.5, 'CAM-1', '', 'ceiling', 'Cat6', false, '')$$) = 'PinPlan subscription inactive', 'lapsed solo cannot insert a marker');
-- Starting a company doesn't start a new trial (20261124300600_email_signup_abuse.sql: a new team's trial is what is
-- left of the owner's personal trial); once the company subscribes they can work again.
select pg_temp.check(public.create_team('Lapsed Co', 'Lee') is not null, 'lapsed solo starts a company');
select pg_temp.check(not (public.team_billing() ->> 'can_work')::boolean, 'their new team gets no fresh trial');
select pg_temp.check(public.solo_billing() is null, 'solo_billing is null once on a team');
reset role;
update public.teams set plan_status = 'active' where owner_id = '00000000-0000-0000-0000-0000000000c2';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, label, room, mount, wire_type, tentative, notes)
  values ('cm2', 'cp2', 'cs2', 'ccam', 0.5, 0.5, 'CAM-1', '', 'ceiling', 'Cat6', false, '');
select pg_temp.check((select count(*) from public.markers where id = 'cm2') = 1, 'with a paying company, the device goes in');

-- enforce = false never locks an unpaid trial (solo or team).
reset role;
update public.billing_settings set enforce = false;
update public.teams set plan_status = 'trialing', trial_ends_at = now() - interval '1 day' where owner_id = '00000000-0000-0000-0000-0000000000c2';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check((public.team_billing() ->> 'can_work')::boolean, 'enforce=false: expired team trial still works');
select pg_temp.check(not (public.team_billing() ->> 'enforce')::boolean, 'team_billing reports enforce=false');
update public.markers set notes = 'not enforced' where id = 'cm2';
select pg_temp.check((select notes from public.markers where id = 'cm2') = 'not enforced', 'enforce=false: device edit allowed');
select pg_temp.check(public.plan_allows_work('incomplete', now() - interval '1 day'), 'enforce=false: incomplete never locks');
select pg_temp.check(not public.plan_allows_work('canceled', now() - interval '1 day'), 'enforce=false: canceled still locks');
select pg_temp.check(not public.plan_allows_work('unpaid', null), 'enforce=false: unpaid still locks');
reset role;
delete from public.team_members where user_id = '00000000-0000-0000-0000-0000000000c2';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check((public.solo_billing() ->> 'can_work')::boolean, 'enforce=false: lapsed solo works');
insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, label, room, mount, wire_type, tentative, notes)
  values ('cm3', 'cp2', 'cs2', 'ccam', 0.4, 0.4, 'CAM-2', '', 'ceiling', 'Cat6', false, '');
select pg_temp.check((select count(*) from public.markers where id = 'cm3') = 1, 'enforce=false: lapsed solo adds a device');
reset role;
update public.billing_settings set enforce = true;
set role authenticated;

-- One trial per owner: a second team by the same person starts with the trial over.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
select pg_temp.check(public.create_team('First Co', 'Ann') is not null, 'owner starts a first team');
-- Signed up 2 days ago: the team gets what is left of the personal trial (12 days), not a fresh 14.
select pg_temp.check((public.team_billing() ->> 'trial_ends_at')::timestamptz between now() + interval '11 days 23 hours' and now() + interval '12 days 1 hour', 'first team gets the rest of the trial');
reset role;
delete from public.teams where owner_id = '00000000-0000-0000-0000-0000000000c4';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c4');
select pg_temp.check(public.create_team('Second Co', 'Ann') is not null, 'owner starts another team');
select pg_temp.check((public.team_billing() ->> 'trial_ends_at')::timestamptz <= now(), 'second team: trial already over');
select pg_temp.check(not (public.team_billing() ->> 'can_work')::boolean, 'second team cannot work until it subscribes');
select pg_temp.check(pg_temp.error_of($$select count(*) from public.billing_trials$$) like '%permission denied%', 'the apps cannot read the trial list');
select pg_temp.check(pg_temp.error_of($$select enforce from public.billing_settings$$) like '%permission denied%', 'the apps cannot read the billing settings');

-- The comp list: a listed owner's new team is comped.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c5');
select pg_temp.check(public.create_team('Comp Co', 'Cy') is not null, 'listed owner starts a team');
select pg_temp.check(public.team_billing() ->> 'status' = 'comped', 'listed owner''s team is comped');
-- An owner from before launch is no longer comped automatically.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check(public.create_team('Early Co', 'Eve') is not null, 'pre-launch owner starts a team');
select pg_temp.check(public.team_billing() ->> 'status' = 'trialing', 'pre-launch owner gets the trial, not comped');

-- Canceled within the trial keeps working; cancel_at is reported; members can't write it.
select pg_temp.as_service();
set role service_role;
update public.teams set plan_status = 'canceled', stripe_subscription_id = 'sub_c1', cancel_at = now() + interval '5 days',
  trial_ends_at = now() + interval '5 days' where owner_id = '00000000-0000-0000-0000-0000000000c1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((public.team_billing() ->> 'can_work')::boolean, 'canceled within the trial can work');
select pg_temp.check((public.team_billing() ->> 'cancel_at')::timestamptz > now(), 'team_billing returns cancel_at');
update public.markers set notes = 'canceled in trial' where id = 'cm1';
select pg_temp.check((select notes from public.markers where id = 'cm1') = 'canceled in trial', 'canceled within the trial: device edit allowed');
select pg_temp.check(pg_temp.error_of($$update public.teams set cancel_at = null$$) similar to '(Billing is managed|permission denied)%', 'owner cannot clear cancel_at');
select pg_temp.check(pg_temp.error_of($$update public.teams set trial_reminder_3d_at = now()$$) similar to '(Billing is managed|permission denied)%', 'owner cannot write the reminder columns');
select pg_temp.as_service();
set role service_role;
update public.teams set trial_ends_at = now() - interval '1 minute' where owner_id = '00000000-0000-0000-0000-0000000000c1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check(pg_temp.error_of($$update public.markers set notes = 'x' where id = 'cm1'$$) = 'PinPlan subscription inactive', 'canceled after the trial: read-only');

-- Read-only covers company-wide rows, photo reports and files too (20261124301000_access_guards.sql).
select pg_temp.check(pg_temp.error_of($$insert into public.device_types (id, name, category) values ('ccam2', 'Camera', 'security')$$) = 'PinPlan subscription inactive',
  'lapsed: no new catalog items');
select pg_temp.check(pg_temp.error_of($$update public.device_types set unit_price = 1 where id = 'ccam'$$) = 'PinPlan subscription inactive', 'lapsed: no catalog price changes');
select pg_temp.check(pg_temp.error_of($$insert into public.products (id, device_type_id, brand, model) values ('cprod', 'ccam', 'B', 'M')$$) = 'PinPlan subscription inactive',
  'lapsed: no new products');
select pg_temp.check(pg_temp.error_of($$insert into public.company_settings (owner_id, business_name) values ('00000000-0000-0000-0000-0000000000c1', 'Early Co')$$) = 'PinPlan subscription inactive',
  'lapsed: company settings are read-only');
select pg_temp.check(pg_temp.error_of($$insert into public.document_settings (owner_id, config) values ('00000000-0000-0000-0000-0000000000c1', '{}')$$) = 'PinPlan subscription inactive',
  'lapsed: document settings are read-only');
select pg_temp.check(pg_temp.error_of($$insert into public.photo_reports (id, project_id, snapshot) values ('rep_lapsed_aaaaaaaaaaaaaa', 'cp1', '{}')$$) = 'PinPlan subscription inactive',
  'lapsed: no new photo reports');
select pg_temp.check(pg_temp.error_of($$insert into storage.objects (bucket_id, name) values ('plans', 'cp1/cimg9')$$) <> '', 'lapsed: no new plan files');
select pg_temp.check(pg_temp.error_of($$insert into storage.objects (bucket_id, name) values ('proposals', '00000000-0000-0000-0000-0000000000c1/tok_lapsed_aaaaaaaaaaaaa/cs1.jpg')$$) <> '',
  'lapsed: no new proposal images');
select pg_temp.check((select count(*) from public.device_types where id = 'ccam') = 1, 'lapsed: the catalog is still readable');
-- Back on a plan, the same writes work.
select pg_temp.as_service();
set role service_role;
update public.teams set plan_status = 'active' where owner_id = '00000000-0000-0000-0000-0000000000c1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check(pg_temp.error_of($$insert into public.device_types (id, name, category) values ('ccam2', 'Camera', 'security')$$) = '', 'active: catalog items go in');
select pg_temp.check(pg_temp.error_of($$insert into public.photo_reports (id, project_id, snapshot) values ('rep_active_aaaaaaaaaaaaaa', 'cp1', '{}')$$) = '', 'active: photo reports go in');
select pg_temp.check(pg_temp.error_of($$insert into storage.objects (bucket_id, name) values ('plans', 'cp1/cimg9')$$) = '', 'active: plan files go in');
select pg_temp.check(pg_temp.error_of($$insert into storage.objects (bucket_id, name) values ('proposals', '00000000-0000-0000-0000-0000000000c1/tok_active_aaaaaaaaaaaaa/cs1.jpg')$$) = '',
  'active: proposal images go in');

reset role;
-- Leave the settings as the other tests expect them.
update public.billing_settings set enforce = false, comp_owner_ids = '{}';
