-- Subscription billing (Stripe): a paying customer is a team. Stripe is the source of truth; the server's webhook
-- copies the subscription onto the team row with the service-role key. Members can read it, nobody else writes it.
-- A team whose subscription has lapsed is read-only: everyone still reads and exports, but job edits are refused.
-- Solo users (not on a team) are not affected. Safe to run more than once.

-- ---------- billing columns on teams ----------
-- plan_status and trial_ends_at are added without defaults first, so the teams that already exist when this runs
-- (the founder's own company) come out NULL and are comped below. On a re-run the columns exist and are NOT NULL /
-- filled in, so nobody is re-comped.
alter table public.teams add column if not exists plan_status text;
alter table public.teams add column if not exists trial_ends_at timestamptz;
alter table public.teams add column if not exists current_period_end timestamptz;
alter table public.teams add column if not exists stripe_customer_id text unique;
alter table public.teams add column if not exists stripe_subscription_id text;
alter table public.teams add column if not exists seat_limit int;
alter table public.teams add column if not exists billing_email text;

-- Teams from before billing: free for good, no seat limit, never locked.
update public.teams set plan_status = 'comped' where plan_status is null;

alter table public.teams alter column plan_status set default 'trialing';
alter table public.teams alter column plan_status set not null;
alter table public.teams alter column trial_ends_at set default now() + interval '14 days';
alter table public.teams drop constraint if exists teams_plan_status_check;
alter table public.teams add constraint teams_plan_status_check
  check (plan_status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'comped'));
alter table public.teams drop constraint if exists teams_seat_limit_check;
alter table public.teams add constraint teams_seat_limit_check check (seat_limit is null or seat_limit >= 1);
alter table public.teams drop constraint if exists teams_billing_email_check;
alter table public.teams add constraint teams_billing_email_check check (billing_email is null or char_length(billing_email) <= 254);

-- ---------- who may work ----------
-- Mirrors planAllowsWork() in src/lib/plans.ts. Past due keeps working while Stripe retries the card.
-- "incomplete" (first payment pending) keeps working only while the team's own trial still runs.
create or replace function public.plan_allows_work(p_status text, p_trial_ends_at timestamptz) returns boolean
language sql stable set search_path = public as $$
  select case
    when p_status in ('active', 'past_due', 'comped') then true
    when p_status = 'trialing' then p_trial_ends_at is null or p_trial_ends_at > now()
    when p_status = 'incomplete' then p_trial_ends_at is not null and p_trial_ends_at > now()
    else false
  end;
$$;

-- Can jobs owned by `owner` be changed? True when the owner isn't on a team (solo use) or the team may work.
create or replace function public.team_can_write(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.plan_allows_work(t.plan_status, t.trial_ends_at)
                   from public.team_members m join public.teams t on t.id = m.team_id
                   where m.user_id = owner), true);
$$;

-- ---------- billing columns: only the server (service role) writes them ----------
-- Invoker rights on purpose: current_user is the caller's role. Writes straight from the apps run as
-- `authenticated`; the service role, the SQL editor (postgres) and our own security-definer functions pass.
create or replace function public.teams_billing_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    -- A new team always starts on the trial.
    new.plan_status := 'trialing';
    new.trial_ends_at := now() + interval '14 days';
    new.current_period_end := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.seat_limit := null;
    new.billing_email := null;
    return new;
  end if;
  if new.plan_status is distinct from old.plan_status or new.trial_ends_at is distinct from old.trial_ends_at
     or new.current_period_end is distinct from old.current_period_end or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id or new.seat_limit is distinct from old.seat_limit
     or new.billing_email is distinct from old.billing_email then
    raise exception 'Billing is managed in Settings → Billing' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists teams_billing_guard on public.teams;
create trigger teams_billing_guard before insert or update on public.teams
  for each row execute function public.teams_billing_guard();

-- ---------- read-only when the subscription has lapsed ----------
-- Runs on every insert/update of job data, so it does one indexed lookup: the job's owner → their team.
-- Only direct writes from the apps (current_user = authenticated) are checked; the server, the SQL editor and the
-- client-facing proposal functions (security definer) are not.
create or replace function public.job_write_guard() returns trigger
language plpgsql set search_path = public as $$
declare owner uuid;
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_table_name in ('projects', 'proposals') then
    owner := new.owner_id;
  else
    owner := public.project_owner(new.project_id);
  end if;
  if owner is not null and not public.team_can_write(owner) then
    raise exception 'PinPlan subscription inactive'
      using errcode = 'P0001', detail = 'This company''s PinPlan subscription has lapsed, so its jobs are read-only.',
            hint = 'The owner or an admin can restart the subscription in Settings → Billing.';
  end if;
  return new;
end $$;

create or replace function public.project_owner(pid text) returns uuid
language sql stable security definer set search_path = public as $$
  select owner_id from public.projects where id = pid;
$$;

do $$
declare t text;
begin
  foreach t in array array['projects','sheets','closets','markers','runs','estimate_lines','photos','photo_comments',
                           'checklists','job_logs','job_documents','proposals',
                           -- added by 20261122000000_documents.sql (which also installs these triggers itself)
                           'sales_documents','sales_document_payments','document_links',
                           -- added by 20261123100400_measurements.sql (which also installs its trigger itself)
                           'measurements'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I_write_guard on public.%I', t, t);
      execute format('create trigger %I_write_guard before insert or update on public.%I for each row execute function public.job_write_guard()', t, t);
    end if;
  end loop;
end $$;

-- ---------- seats and locking when joining ----------
-- Same signature and behaviour as before, plus: a locked team can't take new people, and a team with a seat
-- limit can't go over it.
create or replace function public.accept_team_invite(p_code text, p_name text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare i public.team_invites; uid uuid := auth.uid(); t public.teams; nm text; n int;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into i from public.team_invites where code = upper(trim(p_code)) for update;
  if i.code is null or i.revoked then raise exception 'That invite code is not valid' using errcode = 'P0002'; end if;
  if i.used_by is not null and i.used_by <> uid then raise exception 'That invite has already been used' using errcode = 'P0002'; end if;
  if i.expires_at <= now() and i.used_by is null then raise exception 'That invite has expired. Ask for a new one.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.team_members where user_id = uid and team_id <> i.team_id) then
    raise exception 'You are already on another team. Leave it first.' using errcode = '23505';
  end if;
  -- Lock the team row so two people can't take the last seat at once.
  select * into t from public.teams where id = i.team_id for update;
  if not exists (select 1 from public.team_members where user_id = uid and team_id = i.team_id) then
    if not public.plan_allows_work(t.plan_status, t.trial_ends_at) then
      raise exception 'This company''s PinPlan subscription isn''t active, so it can''t add people right now. Ask the owner to restart it.'
        using errcode = 'P0001';
    end if;
    select count(*) into n from public.team_members where team_id = i.team_id;
    if t.seat_limit is not null and n + 1 > t.seat_limit then
      raise exception 'Your company has used all % seats. Ask the owner to add a seat.', t.seat_limit using errcode = 'P0001';
    end if;
  end if;
  nm := left(coalesce(nullif(trim(p_name), ''), i.name, ''), 80);
  insert into public.team_members (team_id, user_id, role, name, email)
    values (i.team_id, uid, i.role, nm, (select email from auth.users where id = uid))
    on conflict (team_id, user_id) do nothing;
  update public.team_invites set used_by = uid, used_at = coalesce(used_at, now()) where code = i.code;
  return jsonb_build_object('team_id', t.id, 'team', t.name, 'role', (select role from public.team_members where user_id = uid));
end $$;

-- ---------- billing info for the apps ----------
-- The caller's team: status, dates, seats and whether it may work. Null when not on a team.
create or replace function public.team_billing() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'team_id', t.id,
    'status', t.plan_status,
    'trial_ends_at', t.trial_ends_at,
    'current_period_end', t.current_period_end,
    'seat_limit', t.seat_limit,
    'members', (select count(*) from public.team_members x where x.team_id = t.id),
    'can_work', public.plan_allows_work(t.plan_status, t.trial_ends_at),
    'has_subscription', t.stripe_subscription_id is not null,
    'billing_email', t.billing_email)
  from public.team_members m join public.teams t on t.id = m.team_id
  where m.user_id = auth.uid();
$$;

revoke all on function public.accept_team_invite(text, text) from public;
revoke execute on function public.accept_team_invite(text, text) from anon;
grant execute on function public.accept_team_invite(text, text) to authenticated;
revoke all on function public.team_billing() from public;
revoke execute on function public.team_billing() from anon;
grant execute on function public.team_billing() to authenticated;
revoke all on function public.team_can_write(uuid) from public;
revoke execute on function public.team_can_write(uuid) from anon;
grant execute on function public.team_can_write(uuid) to authenticated, service_role;
revoke all on function public.project_owner(text) from public;
revoke execute on function public.project_owner(text) from anon;
grant execute on function public.project_owner(text) to authenticated, service_role;
grant execute on function public.plan_allows_work(text, timestamptz) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ---------- founder accounts ----------
-- Accounts that existed before billing went live (the founder's own) are comped when they start a team later,
-- so the company that built PinPlan is never put on a trial. The launch time is recorded once, on the first run.
create table if not exists public.billing_settings (
  id boolean primary key default true check (id),
  launched_at timestamptz not null default now()
);
alter table public.billing_settings enable row level security;
insert into public.billing_settings (id) values (true) on conflict (id) do nothing;

create or replace function public.teams_founder_comp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select u.created_at from auth.users u where u.id = new.owner_id) < (select launched_at from public.billing_settings where id) then
    new.plan_status := 'comped';
    new.trial_ends_at := null;
  end if;
  return new;
end $$;
-- Fires after teams_billing_guard (triggers run in name order), so it has the last word on a new team.
drop trigger if exists teams_founder_comp on public.teams;
create trigger teams_founder_comp before insert on public.teams
  for each row execute function public.teams_founder_comp();
