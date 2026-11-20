-- Invites bound to an email: only that account can accept them. Run after the migrations; any failed check raises.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000e1a1', 'boss@invite-email.test'),
                                          ('00000000-0000-0000-0000-00000000e1a2', 'Sam@Invite-Email.test'),
                                          ('00000000-0000-0000-0000-00000000e1a3', 'next.person@invite-email.test'),
                                          ('00000000-0000-0000-0000-00000000e1a4', 'anyone@invite-email.test');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'INVITE EMAIL CHECK FAILED: %', what; end if;
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
select pg_temp.as_user('00000000-0000-0000-0000-00000000e1a1');
select pg_temp.check(public.create_team('Invite Email Co', 'Boss') is not null, 'owner starts a team');
-- The web app sets the email when the invite is made for an address (team.ts createInvite), lower case.
insert into public.team_invites (code, team_id, role, name, email) values ('EMAILBND01', public.my_team_id(), 'admin', 'Sam', 'sam@invite-email.test');
insert into public.team_invites (code, team_id, role, name) values ('OPENCODE01', public.my_team_id(), 'tech', '');

-- Someone else who got hold of the code (a forwarded text, a shared device) can't use it.
select pg_temp.as_user('00000000-0000-0000-0000-00000000e1a3');
select pg_temp.check(pg_temp.fails($$select public.accept_team_invite('EMAILBND01', 'Not Sam')$$), 'another account cannot accept an invite sent to an email');
reset role;
select pg_temp.check((select used_by is null from public.team_invites where code = 'EMAILBND01'), 'the refused invite is still unused');
select pg_temp.check(not exists (select 1 from public.team_members where user_id = '00000000-0000-0000-0000-00000000e1a3'), 'the refused account did not join');
set role authenticated;

-- An invite without an email still works for whoever has the code.
select pg_temp.check(public.accept_team_invite('OPENCODE01', '') ->> 'role' = 'tech', 'an invite without an email works as before');

-- The invited address joins (its email's case doesn't matter).
select pg_temp.as_user('00000000-0000-0000-0000-00000000e1a2');
select pg_temp.check(public.accept_team_invite('emailbnd01', '') ->> 'role' = 'admin', 'the invited email accepts its invite');
select pg_temp.check(public.accept_team_invite('EMAILBND01', '') ->> 'role' = 'admin', 'accepting again is harmless');

-- Marking an email-bound invite used for another account directly is refused too, even by the owner.
select pg_temp.as_user('00000000-0000-0000-0000-00000000e1a1');
insert into public.team_invites (code, team_id, role, name, email) values ('EMAILBND02', public.my_team_id(), 'tech', '', 'sam@invite-email.test');
select pg_temp.check(pg_temp.fails($$update public.team_invites set used_by = '00000000-0000-0000-0000-00000000e1a4' where code = 'EMAILBND02'$$),
  'an email-bound invite cannot be marked used by another account');
update public.team_invites set name = 'Renamed' where code = 'EMAILBND01';
select pg_temp.check((select name from public.team_invites where code = 'EMAILBND01') = 'Renamed', 'a used invite can still be edited');
reset role;

select 'invite_email_test PASSED';
