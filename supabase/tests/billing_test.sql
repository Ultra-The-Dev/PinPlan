-- Billing checks: run after the migrations (also works inside a transaction that is rolled back).
-- Any failed check raises an exception.
\set ON_ERROR_STOP on
-- These checks are about billing as enforced at launch (20261124100200_billing_policy.sql: billing_settings.enforce).
update public.billing_settings set enforce = true;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'bowner@example.com'),
                                          ('00000000-0000-0000-0000-0000000000b2', 'btech@example.com'),
                                          ('00000000-0000-0000-0000-0000000000b3', 'boffice@example.com'),
                                          ('00000000-0000-0000-0000-0000000000b4', 'bsolo@example.com'),
                                          ('00000000-0000-0000-0000-0000000000b5', 'blate@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'BILLING CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
-- The error message a statement raises ('' when it succeeds).
create function pg_temp.error_of(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;
-- What the Stripe webhook does: write the team row with the service role.
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
end $$;

set role authenticated;

-- A new team starts on the 14-day trial and may work.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into public.projects (id, client_name, address, status) values ('bp1', 'Client', '1 Bill St', 'estimate');
insert into public.sheets (id, project_id, name, page_number, sort_order, image_id, width, height) values ('bs1', 'bp1', 'Main', 1, 0, 'bimg1', 1000, 800);
insert into public.device_types (id, name, category) values ('bcam', 'Camera', 'security');
select pg_temp.check(public.create_team('Billing Test Co', 'Bea') is not null, 'owner creates a team');
select pg_temp.check((public.team_billing() ->> 'status') = 'trialing', 'new team is trialing');
select pg_temp.check((public.team_billing() ->> 'trial_ends_at')::timestamptz between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour', 'trial ends in 14 days');
select pg_temp.check((public.team_billing() ->> 'can_work')::boolean, 'trial team can work');
select pg_temp.check((public.team_billing() ->> 'members')::int = 1, 'one member');
select pg_temp.check(public.team_billing() ->> 'seat_limit' is null, 'no seat limit during the trial');
select pg_temp.check((select plan_status from public.teams) = 'trialing', 'members can read the billing columns');

-- Members can't touch billing; renaming still works.
select pg_temp.check(pg_temp.fails($$update public.teams set plan_status = 'comped'$$), 'owner cannot comp their own team');
select pg_temp.check(pg_temp.fails($$update public.teams set trial_ends_at = now() + interval '1 year'$$), 'owner cannot extend the trial');
select pg_temp.check(pg_temp.fails($$update public.teams set seat_limit = 99$$), 'owner cannot raise the seat limit');
select pg_temp.check(pg_temp.fails($$update public.teams set stripe_customer_id = 'cus_fake'$$), 'owner cannot change the Stripe customer');
update public.teams set name = 'Billing Test Company';
select pg_temp.check((select name from public.teams) = 'Billing Test Company', 'owner can still rename the team');
insert into public.team_invites (code, team_id, role, name) values ('BTECHCODE', public.my_team_id(), 'tech', 'Ty');
insert into public.team_invites (code, team_id, role, name, email) values ('BOFFICE01', public.my_team_id(), 'admin', 'Al', 'boffice@example.com');
insert into public.team_invites (code, team_id, role, name) values ('BLATE0001', public.my_team_id(), 'tech', 'Lee');

-- The webhook (service role) records a paid subscription with 2 seats.
select pg_temp.as_service();
set role service_role;
update public.teams set plan_status = 'active', seat_limit = 2, stripe_customer_id = 'cus_test_b', stripe_subscription_id = 'sub_test_b',
  current_period_end = now() + interval '30 days' where owner_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;

-- Seats: the tech takes the second seat; the office invite is refused with a clear message.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check(public.accept_team_invite('BTECHCODE', '') ->> 'role' = 'tech', 'tech joins (seat 2 of 2)');
select pg_temp.check(public.accept_team_invite('BTECHCODE', '') ->> 'role' = 'tech', 'accepting the same code again still works when full');
select pg_temp.check((public.team_billing() ->> 'members')::int = 2, 'tech sees two members');
select pg_temp.check(public.team_billing() ->> 'status' = 'active', 'tech sees the plan status');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select pg_temp.check(pg_temp.error_of($$select public.accept_team_invite('BOFFICE01', '')$$) = 'Your company has used all 2 seats. Ask the owner to add a seat.', 'full team refuses a third person');
select pg_temp.check(public.team_billing() is null, 'refused joiner is on no team');

-- The owner adds a seat (Stripe → webhook raises the limit): the office joins.
select pg_temp.as_service();
set role service_role;
update public.teams set seat_limit = 3 where owner_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select pg_temp.check(public.accept_team_invite('BOFFICE01', '') ->> 'role' = 'admin', 'office joins after a seat is added');

-- Active: everyone works.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, label, room, mount, wire_type, tentative, notes)
  values ('bm1', 'bp1', 'bs1', 'bcam', 0.5, 0.5, 'CAM-1', '', 'ceiling', 'Cat6', false, '');
select pg_temp.check((select count(*) from public.markers where project_id = 'bp1') = 1, 'active team: tech adds a device');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into public.proposals (id, project_id, snapshot) values ('bproposal-token-000000001', 'bp1', '{"lines": []}');

-- Past due keeps working while Stripe retries the card.
select pg_temp.as_service();
set role service_role;
update public.teams set plan_status = 'past_due' where owner_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
update public.projects set notes = 'past due edit' where id = 'bp1';
select pg_temp.check((select notes from public.projects where id = 'bp1') = 'past due edit', 'past due team can still work');

-- Canceled: read-only. Reads work; every kind of job write is refused with the known message.
select pg_temp.as_service();
set role service_role;
-- (after the trial: a team that cancels during its trial keeps working until the trial ends)
update public.teams set plan_status = 'canceled', trial_ends_at = now() - interval '1 minute' where owner_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check(not (public.team_billing() ->> 'can_work')::boolean, 'canceled team cannot work');
select pg_temp.check((select count(*) from public.projects where id = 'bp1') = 1, 'locked owner still reads jobs');
select pg_temp.check((select count(*) from public.markers where project_id = 'bp1') = 1, 'locked owner still reads devices');
select pg_temp.check(pg_temp.error_of($$update public.projects set notes = 'x' where id = 'bp1'$$) = 'PinPlan subscription inactive', 'locked: job update refused');
select pg_temp.check(pg_temp.error_of($$insert into public.projects (id, client_name, address, status) values ('bp9', 'C', 'A', 'estimate')$$) = 'PinPlan subscription inactive', 'locked: new job refused');
select pg_temp.check(pg_temp.error_of($$insert into public.estimate_lines (id, project_id, key) values ('bel1', 'bp1', 'dev:bcam')$$) = 'PinPlan subscription inactive', 'locked: estimate line refused');
select pg_temp.check(pg_temp.error_of($$insert into public.proposals (id, project_id, snapshot) values ('bproposal-token-000000002', 'bp1', '{}')$$) = 'PinPlan subscription inactive', 'locked: new proposal refused');
select pg_temp.check(pg_temp.error_of($$insert into public.checklists (id, project_id, name) values ('bcl1', 'bp1', 'Rough-in')$$) = 'PinPlan subscription inactive', 'locked: checklist refused');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check(pg_temp.error_of($$update public.markers set notes = 'x' where id = 'bm1'$$) = 'PinPlan subscription inactive', 'locked: tech device edit refused');
select pg_temp.check(pg_temp.error_of($$insert into public.projects (id, client_name, address, status) values ('bp8', 'C', 'A', 'estimate')$$) = 'PinPlan subscription inactive', 'locked: tech''s own new job refused');
select pg_temp.check(pg_temp.error_of($$insert into public.photos (id, project_id, image_id) values ('bph1', 'bp1', 'bimg2')$$) = 'PinPlan subscription inactive', 'locked: photo refused');
-- A locked team can't take people even with seats free.
select pg_temp.as_service();
set role service_role;
update public.teams set seat_limit = 10 where owner_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b5');
select pg_temp.check(pg_temp.error_of($$select public.accept_team_invite('BLATE0001', '')$$) like '%subscription isn''t active%', 'locked team refuses new people');
-- Clients still open (and mark viewed) a proposal sent before the lapse.
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false),
       set_config('request.jwt.claims', '{"role": "anon"}', false);
set role anon;
select pg_temp.check(public.get_proposal('bproposal-token-000000001') ->> 'status' = 'viewed', 'client opens a proposal of a locked team');
set role authenticated;

-- The SQL editor (no JWT, postgres) and the service role are never locked out.
reset role;
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false), set_config('request.jwt.claims', '', false);
update public.projects set notes = 'fixed by support' where id = 'bp1';
select pg_temp.check((select notes from public.projects where id = 'bp1') = 'fixed by support', 'postgres can still write a locked job');

-- An expired trial locks too; resubscribing unlocks.
select pg_temp.as_service();
set role service_role;
update public.teams set plan_status = 'trialing', trial_ends_at = now() - interval '1 minute' where owner_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check(not (public.team_billing() ->> 'can_work')::boolean, 'expired trial cannot work');
select pg_temp.check(pg_temp.fails($$update public.projects set notes = 'x' where id = 'bp1'$$), 'expired trial: job update refused');
select pg_temp.as_service();
set role service_role;
update public.teams set plan_status = 'incomplete' where owner_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check(not (public.team_billing() ->> 'can_work')::boolean, 'incomplete after the trial cannot work');
select pg_temp.as_service();
set role service_role;
update public.teams set plan_status = 'active' where owner_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
update public.projects set notes = 'back in business' where id = 'bp1';
select pg_temp.check((select notes from public.projects where id = 'bp1') = 'back in business', 'resubscribed team works again');

-- Comped teams always work, with no seat limit.
select pg_temp.as_service();
set role service_role;
update public.teams set plan_status = 'comped', seat_limit = null, trial_ends_at = null where owner_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check((public.team_billing() ->> 'can_work')::boolean, 'comped team can work');
update public.markers set notes = 'comped edit' where id = 'bm1';
select pg_temp.check((select notes from public.markers where id = 'bm1') = 'comped edit', 'comped team: tech edits a device');

-- Solo users (no team) are never affected.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b4');
select pg_temp.check(public.team_billing() is null, 'solo user has no team billing');
select pg_temp.check(public.team_can_write('00000000-0000-0000-0000-0000000000b4'), 'solo user can write');
insert into public.projects (id, client_name, address, status) values ('bsolo1', 'Solo', '9 Alone Rd', 'estimate');
update public.projects set notes = 'solo edit' where id = 'bsolo1';
select pg_temp.check((select notes from public.projects where id = 'bsolo1') = 'solo edit', 'solo user works as before');

reset role;
-- Back to the default for the tests that follow.
update public.billing_settings set enforce = false;
