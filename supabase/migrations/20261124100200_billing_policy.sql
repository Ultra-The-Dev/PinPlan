-- Billing policy for launch (builds on 20261121000000_billing.sql). Safe to run more than once.
--  * Every account needs a company: a user on no team who signed up after billing_settings.launched_at gets a
--    personal trial (sign-up + 14 days), then their jobs are read-only until they start or join a company team.
--    Accounts from before launch keep working on their own.
--  * One free trial per owner: the first team someone starts gets 14 days; a later team they start has none.
--  * billing_settings.enforce (default false): while false, an unpaid trial never locks anyone, so a server without
--    Stripe never locks a company. Switch it on after a live Stripe test:
--      update public.billing_settings set enforce = true;
--  * Comped (free for good) teams come from an explicit list, billing_settings.comp_owner_ids, instead of
--    "accounts older than launch". Existing comped teams are left as they are.
--  * A team that canceled (or whose first payment is pending) keeps working until its own trial ends.
--  * teams.cancel_at (a cancellation scheduled in Stripe), and the columns the server uses to send each billing
--    email once (trial reminders at 3 days and 1 day left, one "payment failed" email per invoice).

-- ---------- settings ----------
alter table public.billing_settings add column if not exists enforce boolean not null default false;
alter table public.billing_settings add column if not exists comp_owner_ids uuid[] not null default '{}';
-- Only the server (service role) and the SQL editor read or change the settings.
revoke all on public.billing_settings from anon, authenticated;
grant select, update on public.billing_settings to service_role;

-- Is billing switched on? Read by the policy functions below (security definer: the table is closed to the apps).
create or replace function public.billing_enforced() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select enforce from public.billing_settings where id), false);
$$;

-- ---------- one trial per owner ----------
-- A row per person who has started a team (their trial is used). Closed to the apps; written by the trigger below.
create table if not exists public.billing_trials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  trial_used_at timestamptz not null default now()
);
alter table public.billing_trials enable row level security;
revoke all on public.billing_trials from anon, authenticated;
grant select on public.billing_trials to service_role;
-- Owners of the teams that already exist have used theirs.
insert into public.billing_trials (user_id, trial_used_at)
  select t.owner_id, min(t.created_at) from public.teams t join auth.users u on u.id = t.owner_id
  where t.owner_id is not null group by t.owner_id
  on conflict (user_id) do nothing;

-- ---------- new team columns ----------
alter table public.teams add column if not exists cancel_at timestamptz;
alter table public.teams add column if not exists trial_reminder_3d_at timestamptz;
alter table public.teams add column if not exists trial_reminder_1d_at timestamptz;
alter table public.teams add column if not exists payment_failed_invoice_id text;

-- Same as before, plus the new columns: only the server writes them.
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
    new.cancel_at := null;
    new.trial_reminder_3d_at := null;
    new.trial_reminder_1d_at := null;
    new.payment_failed_invoice_id := null;
    return new;
  end if;
  if new.plan_status is distinct from old.plan_status or new.trial_ends_at is distinct from old.trial_ends_at
     or new.current_period_end is distinct from old.current_period_end or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id or new.seat_limit is distinct from old.seat_limit
     or new.billing_email is distinct from old.billing_email or new.cancel_at is distinct from old.cancel_at
     or new.trial_reminder_3d_at is distinct from old.trial_reminder_3d_at or new.trial_reminder_1d_at is distinct from old.trial_reminder_1d_at
     or new.payment_failed_invoice_id is distinct from old.payment_failed_invoice_id then
    raise exception 'Billing is managed in Settings → Billing' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------- a new team: comp list, then the one-trial rule ----------
-- Replaces teams_founder_comp ("accounts older than launch are comped"). Runs after teams_billing_guard
-- (triggers run in name order), so it has the last word on a new team.
drop trigger if exists teams_founder_comp on public.teams;
drop function if exists public.teams_founder_comp();
create or replace function public.teams_trial_policy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is null then return new; end if;
  if new.owner_id = any (coalesce((select comp_owner_ids from public.billing_settings where id), '{}')) then
    new.plan_status := 'comped';
    new.trial_ends_at := null;
    return new;
  end if;
  if new.plan_status = 'trialing' then
    if exists (select 1 from public.billing_trials where user_id = new.owner_id) then
      new.trial_ends_at := now(); -- trial already used: subscribe to keep working
    elsif exists (select 1 from auth.users where id = new.owner_id) then
      insert into public.billing_trials (user_id) values (new.owner_id) on conflict (user_id) do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists teams_trial_policy on public.teams;
create trigger teams_trial_policy before insert on public.teams
  for each row execute function public.teams_trial_policy();

-- ---------- who may work ----------
-- Mirrors planAllowsWork() in src/lib/plans.ts.
--  active, past due (Stripe retries the card), comped: yes.
--  trialing: until the trial ends (no end date: no deadline).
--  incomplete (first payment pending) or canceled: until the team's own trial ends.
--  While billing isn't enforced, an unpaid trial never locks.
create or replace function public.plan_allows_work(p_status text, p_trial_ends_at timestamptz) returns boolean
language sql stable set search_path = public as $$
  select case
    when p_status in ('active', 'past_due', 'comped') then true
    when p_status = 'trialing' and (p_trial_ends_at is null or p_trial_ends_at > now()) then true
    when p_status in ('incomplete', 'canceled') and p_trial_ends_at is not null and p_trial_ends_at > now() then true
    when coalesce(p_status, 'none') in ('trialing', 'incomplete', 'none') and not public.billing_enforced() then true
    else false
  end;
$$;

-- A person on no team: the end of their personal trial (null: no deadline — signed up before launch, or comped).
create or replace function public.solo_trial_ends_at(p_user uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case
    when u.created_at is null then null
    when s.id is null or u.created_at < s.launched_at then null
    when p_user = any (s.comp_owner_ids) then null
    else u.created_at + interval '14 days'
  end
  from auth.users u left join public.billing_settings s on s.id
  where u.id = p_user;
$$;

create or replace function public.solo_allows_work(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not public.billing_enforced() or coalesce(public.solo_trial_ends_at(p_user) > now(), true);
$$;

-- Can jobs owned by `owner` be changed? The owner's team decides; on no team, their personal trial does.
create or replace function public.team_can_write(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.plan_allows_work(t.plan_status, t.trial_ends_at)
                   from public.team_members m join public.teams t on t.id = m.team_id
                   where m.user_id = owner),
                  public.solo_allows_work(owner));
$$;

-- ---------- billing info for the apps ----------
-- Same as before, plus cancel_at and whether billing is enforced.
create or replace function public.team_billing() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'team_id', t.id,
    'status', t.plan_status,
    'trial_ends_at', t.trial_ends_at,
    'current_period_end', t.current_period_end,
    'cancel_at', t.cancel_at,
    'seat_limit', t.seat_limit,
    'members', (select count(*) from public.team_members x where x.team_id = t.id),
    'can_work', public.plan_allows_work(t.plan_status, t.trial_ends_at),
    'enforce', public.billing_enforced(),
    'has_subscription', t.stripe_subscription_id is not null,
    'billing_email', t.billing_email)
  from public.team_members m join public.teams t on t.id = m.team_id
  where m.user_id = auth.uid();
$$;

-- The caller when on no team: their personal trial. Null when on a team (see team_billing) or signed out.
create or replace function public.solo_billing() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trial_ends_at', public.solo_trial_ends_at(u.id),
    'can_work', public.solo_allows_work(u.id),
    'enforce', public.billing_enforced())
  from auth.users u
  where u.id = auth.uid() and not exists (select 1 from public.team_members m where m.user_id = u.id);
$$;

revoke all on function public.billing_enforced() from public;
grant execute on function public.billing_enforced() to anon, authenticated, service_role;
revoke all on function public.solo_trial_ends_at(uuid) from public;
revoke execute on function public.solo_trial_ends_at(uuid) from anon, authenticated;
grant execute on function public.solo_trial_ends_at(uuid) to service_role;
revoke all on function public.solo_allows_work(uuid) from public;
revoke execute on function public.solo_allows_work(uuid) from anon;
grant execute on function public.solo_allows_work(uuid) to authenticated, service_role;
revoke all on function public.team_can_write(uuid) from public;
revoke execute on function public.team_can_write(uuid) from anon;
grant execute on function public.team_can_write(uuid) to authenticated, service_role;
revoke all on function public.team_billing() from public;
revoke execute on function public.team_billing() from anon;
grant execute on function public.team_billing() to authenticated;
revoke all on function public.solo_billing() from public;
revoke execute on function public.solo_billing() from anon;
grant execute on function public.solo_billing() to authenticated;
grant execute on function public.plan_allows_work(text, timestamptz) to anon, authenticated, service_role;
revoke all on function public.teams_trial_policy() from public;

notify pgrst, 'reload schema';
