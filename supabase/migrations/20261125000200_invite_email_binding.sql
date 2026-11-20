-- Invites sent to an email address are for that address only. Safe to run more than once.
--
-- team_invites.email (20261124100400_rate_limits.sql) already limits which account /api/team/join creates for a code,
-- and the apps now set it whenever an invite is made or sent for an address. Accepting the code was still open to any
-- signed-in account: someone who saw the code (a forwarded text, a shared device that remembered it) could join the
-- company in the invited person's place. This guard makes the database refuse that, however the invite is used:
-- accept_team_invite() marks the invite used (used_by), so the check sits on that write and rolls the whole join back
-- (membership included) when the account's email isn't the invite's. Invites without an email keep working as before.

create or replace function public.team_invites_email_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if new.used_by is null or new.email is null then return new; end if;
  if tg_op = 'UPDATE' and old.used_by is not distinct from new.used_by and old.email is not distinct from new.email then return new; end if;
  select lower(trim(email)) into who from auth.users where id = new.used_by;
  if who is distinct from lower(trim(new.email)) then
    raise exception 'That invite was sent to a different email address. Sign in with that email, or ask for a new invite.'
      using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.team_invites_email_guard() from public, anon, authenticated;

drop trigger if exists team_invites_email_guard on public.team_invites;
create trigger team_invites_email_guard before insert or update on public.team_invites
  for each row execute function public.team_invites_email_guard();

notify pgrst, 'reload schema';
