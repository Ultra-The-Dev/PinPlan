-- Email and sign-up abuse. Safe to run more than once. Builds on 20261124100500_email_guard.sql,
-- 20261124100400_rate_limits.sql and 20261124100200_billing_policy.sql.
--
-- 1. A platform-wide email allowance (email_settings): every company's sends together stay under daily_platform_cap
--    in 24 hours, and free trials together under trial_share of it, so trials can't use up PinPlan's whole sending
--    allowance (or its reputation). The count runs in email_send_reserve() under one lock. The first reservation that
--    takes the platform past alert_pct (80 %) in a day says so (platform_alert), and the server logs a warning.
--    Recipients are normalised before hashing (lower case, "+tag" dropped, dots dropped for Gmail), here and in
--    src/lib/server/sendGuard.ts recipientHash, so a.b+1@gmail.com and ab@gmail.com count as one address.
-- 2. Invite codes: at most 20 open invites per team on a trial (200 when paying), and team_invites.invite_emailed_at,
--    set only by the server (/api/team/invite-email) after it emailed the invite. /api/team/join only creates an
--    account for an invite PinPlan itself emailed. Changing the invite's email from the apps clears it.
-- 3. One trial per email address, even after the account is deleted: used_trials keeps a hash of each address that
--    started a trial (no link to auth.users, so deleting the account doesn't free it). The personal trial counts from
--    the first time the address signed up, and a new team's trial is what is left of the owner's personal trial
--    (least(now() + 14 days, solo_trial_ends_at(owner))).
-- 4. A record of who accepted which terms and when (terms_acceptances): insert-only, through accept_terms() or copied
--    from the sign-up's metadata (terms_version / terms_accepted_at) when the account is created.

-- ---------- helpers: normalised address and its hash ----------
-- Lower case and trimmed; the "+tag" dropped from the local part; for gmail.com / googlemail.com the dots dropped too
-- (Gmail ignores them) and googlemail.com read as gmail.com. Must match normalizeEmail() in sendGuard.ts.
create or replace function public.email_normalize(p_email text) returns text
language plpgsql immutable set search_path = public as $$
declare e text := lower(trim(coalesce(p_email, ''))); at int; local text; domain text;
begin
  if e = '' then return null; end if;
  if position('@' in e) = 0 then return e; end if;
  -- The last @ splits the address.
  at := length(e) - position('@' in reverse(e)) + 1;
  local := left(e, at - 1);
  domain := substr(e, at + 1);
  if position('+' in local) > 1 then local := left(local, position('+' in local) - 1); end if;
  if domain in ('gmail.com', 'googlemail.com') then
    local := replace(local, '.', '');
    domain := 'gmail.com';
  end if;
  return local || '@' || domain;
end $$;

-- sha256 (hex) of the normalised address. Same value as recipientHash() in sendGuard.ts.
create or replace function public.email_hash(p_email text) returns text
language sql immutable set search_path = public as $$
  select case when public.email_normalize(p_email) is null then null
              else encode(sha256(convert_to(public.email_normalize(p_email), 'UTF8')), 'hex') end;
$$;

-- ---------- 1. platform-wide email allowance ----------
create table if not exists public.email_settings (
  id boolean primary key default true check (id),
  -- All of PinPlan's capped email (documents, reminders, receipts, invites, welcomes, notifications) in 24 hours.
  daily_platform_cap int not null default 2000 check (daily_platform_cap >= 0),
  -- The part of it free trials may use together (0-1).
  trial_share numeric not null default 0.3 check (trial_share >= 0 and trial_share <= 1),
  -- Warn (server log) once a day when the platform passes this share of its cap (percent).
  alert_pct int not null default 80 check (alert_pct between 1 and 100),
  last_alert_at timestamptz
);
insert into public.email_settings (id) values (true) on conflict (id) do nothing;
alter table public.email_settings enable row level security;
revoke all on public.email_settings from public, anon, authenticated, service_role;
grant select, update on public.email_settings to service_role;

-- Was this send by a free trial? (Counts against the trials' share of the platform cap.)
alter table public.email_sends add column if not exists trial boolean not null default false;
create index if not exists email_sends_created_idx on public.email_sends (created_at);

-- Same as before, plus: one platform-wide lock, the platform cap and the trials' share of it, and platform_alert.
-- New refusal reason: platform_cap (with trial).
create or replace function public.email_send_reserve(p_user uuid, p_kind text, p_recipient_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  confirmed timestamptz;
  found_user boolean;
  t public.teams;
  trial boolean;
  n int;
  r int;
  cap int;
  rcap int;
  new_id bigint;
  s public.email_settings;
  pn int;
  tn int;
  alert boolean := false;
begin
  if p_kind is null or p_kind not in ('document', 'reminder', 'receipt', 'invite', 'welcome') then
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;
  if p_recipient_hash is null or char_length(p_recipient_hash) not between 16 and 128 then
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;
  select true, u.email_confirmed_at into found_user, confirmed from auth.users u where u.id = p_user;
  if not coalesce(found_user, false) then return jsonb_build_object('ok', false, 'reason', 'no_user'); end if;
  if confirmed is null then return jsonb_build_object('ok', false, 'reason', 'unconfirmed'); end if;

  select tm.* into t from public.team_members m join public.teams tm on tm.id = m.team_id where m.user_id = p_user limit 1;
  if t.id is not null and not public.plan_allows_work(t.plan_status, t.trial_ends_at) then
    return jsonb_build_object('ok', false, 'reason', 'plan_inactive', 'team_id', t.id);
  end if;
  -- Anything not paid for counts as a trial here: a team that cancelled during its trial (or has no status) is still
  -- working for free, so it gets the trial allowance and share, not a paying company's.
  trial := t.id is null or coalesce(t.plan_status, 'none') not in ('active', 'past_due', 'comped');

  -- One lock for every sender: the company counts and the platform count below are taken together, so two requests
  -- can't both take the last slot of either.
  perform pg_advisory_xact_lock(hashtext('pinplan_email_sends'), 0);

  -- The platform first: every company together, then free trials together.
  select * into s from public.email_settings where id;
  if s.id is null then s.daily_platform_cap := 2000; s.trial_share := 0.3; s.alert_pct := 80; end if;
  select count(*), count(*) filter (where e.trial) into pn, tn from public.email_sends e where e.created_at > now() - interval '24 hours';
  if pn >= s.daily_platform_cap then
    return jsonb_build_object('ok', false, 'reason', 'platform_cap', 'team_id', t.id, 'trial', trial);
  end if;
  if trial and tn >= floor(s.daily_platform_cap * s.trial_share) then
    return jsonb_build_object('ok', false, 'reason', 'platform_cap', 'team_id', t.id, 'trial', trial);
  end if;

  cap := public.email_daily_cap(p_kind, trial);
  rcap := public.email_recipient_cap(trial);
  select count(*) into n from public.email_sends e
    where (case when t.id is not null then e.team_id = t.id else e.team_id is null and e.user_id = p_user end)
      and e.created_at > now() - interval '24 hours'
      and (case when p_kind in ('document', 'reminder', 'receipt') then e.kind in ('document', 'reminder', 'receipt') else e.kind = p_kind end);
  if n >= cap then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap', 'team_id', t.id, 'trial', trial, 'sent_today', n, 'cap', cap);
  end if;
  select count(*) into r from public.email_sends e
    where (case when t.id is not null then e.team_id = t.id else e.team_id is null and e.user_id = p_user end)
      and e.recipient_hash = p_recipient_hash and e.kind <> 'notify'
      and e.created_at > now() - interval '24 hours';
  if r >= rcap then
    return jsonb_build_object('ok', false, 'reason', 'recipient_cap', 'team_id', t.id, 'trial', trial);
  end if;

  insert into public.email_sends (team_id, user_id, kind, recipient_hash, trial) values (t.id, p_user, p_kind, p_recipient_hash, trial)
    returning id into new_id;

  -- Past alert_pct of the platform cap: say so once a day.
  if s.id is not null and (pn + 1) * 100 >= s.daily_platform_cap::bigint * s.alert_pct
     and (s.last_alert_at is null or s.last_alert_at <= now() - interval '24 hours') then
    update public.email_settings set last_alert_at = now() where id;
    alert := true;
  end if;
  return jsonb_build_object('ok', true, 'id', new_id, 'team_id', t.id, 'trial', trial, 'sent_today', n + 1, 'cap', cap,
                            'platform_alert', alert);
end $$;

-- ---------- 2. invite codes ----------
-- When PinPlan emailed this invite (to team_invites.email). Only the server sets it; /api/team/join creates an account
-- only for an invite that has both.
alter table public.team_invites add column if not exists invite_emailed_at timestamptz;

-- invite_emailed_at belongs to the server. A write from the apps can't set or keep it while moving the invite to
-- another address (that would let an owner point an emailed invite at someone else's address and have /api/team/join
-- make an account for it). Invoker rights on purpose, as team_invites_signup_guard.
create or replace function public.team_invites_emailed_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.invite_emailed_at := null;
  elsif new.email is distinct from old.email then
    new.invite_emailed_at := null;
  else
    new.invite_emailed_at := old.invite_emailed_at;
  end if;
  return new;
end $$;
drop trigger if exists team_invites_emailed_guard on public.team_invites;
create trigger team_invites_emailed_guard before insert or update on public.team_invites
  for each row execute function public.team_invites_emailed_guard();

-- Open invites (not used, revoked or expired) per team: 20 on a trial, 200 when paying. Every live code is a way to
-- create an account, so a free team can't mint thousands. Applies to everyone (the apps and the server).
create or replace function public.team_invites_open_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text; n int; cap int;
begin
  perform pg_advisory_xact_lock(hashtext('pinplan_team_invites'), hashtext(new.team_id::text));
  select plan_status into st from public.teams where id = new.team_id;
  -- Paying (or comped) teams get the larger allowance; trials, cancelled teams and unknown statuses the small one.
  cap := case when coalesce(st, 'none') in ('active', 'past_due', 'comped') then 200 else 20 end;
  select count(*) into n from public.team_invites i
    where i.team_id = new.team_id and not i.revoked and i.used_by is null and i.expires_at > now();
  if n >= cap then
    raise exception 'Your team has % open invites. Revoke some you no longer need, then try again.', n using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists team_invites_open_cap on public.team_invites;
create trigger team_invites_open_cap before insert on public.team_invites
  for each row execute function public.team_invites_open_cap();

-- ---------- 3. one trial per email address ----------
create table if not exists public.used_trials (
  -- public.email_hash(email): never the address itself. No foreign key: deleting the account keeps the row.
  email_hash text primary key check (char_length(email_hash) = 64),
  first_trial_at timestamptz not null default now()
);
alter table public.used_trials enable row level security;
revoke all on public.used_trials from public, anon, authenticated, service_role;
grant select on public.used_trials to service_role;
-- Everyone already here has started theirs (personal trial at sign-up).
insert into public.used_trials (email_hash, first_trial_at)
  select public.email_hash(u.email), min(u.created_at) from auth.users u
  where public.email_hash(u.email) is not null and u.created_at is not null group by 1
  on conflict (email_hash) do update set first_trial_at = least(public.used_trials.first_trial_at, excluded.first_trial_at);

-- A person on no team: the end of their personal trial. As before, but counted from the first time this address
-- signed up (an account deleted and made again doesn't start a new trial).
create or replace function public.solo_trial_ends_at(p_user uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case
    when u.created_at is null then null
    when s.id is null or u.created_at < s.launched_at then null
    when p_user = any (s.comp_owner_ids) then null
    else least(u.created_at, (select ut.first_trial_at from public.used_trials ut where ut.email_hash = public.email_hash(u.email)))
         + interval '14 days'
  end
  from auth.users u left join public.billing_settings s on s.id
  where u.id = p_user;
$$;

-- A new team: the comp list, then one trial per owner (and per address), no longer than what is left of the
-- owner's personal trial.
create or replace function public.teams_trial_policy() returns trigger
language plpgsql security definer set search_path = public as $$
declare em text; h text; solo timestamptz;
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
      select u.email into em from auth.users u where u.id = new.owner_id;
      h := public.email_hash(em);
      solo := public.solo_trial_ends_at(new.owner_id);
      new.trial_ends_at := least(coalesce(new.trial_ends_at, now() + interval '14 days'), solo);
      insert into public.billing_trials (user_id) values (new.owner_id) on conflict (user_id) do nothing;
      if h is not null then
        insert into public.used_trials (email_hash) values (h) on conflict (email_hash) do nothing;
      end if;
    end if;
  end if;
  return new;
end $$;

-- ---------- 4. terms acceptances ----------
create table if not exists public.terms_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null check (version ~ '^[A-Za-z0-9_.-]{1,32}$'),
  accepted_at timestamptz not null default now(),
  ip text check (ip is null or char_length(ip) <= 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 512)
);
create index if not exists terms_acceptances_user_idx on public.terms_acceptances (user_id, accepted_at);
alter table public.terms_acceptances enable row level security;
-- People may read their own record; nobody may change or remove it (no update or delete grants, for anyone).
drop policy if exists terms_acceptances_own on public.terms_acceptances;
create policy terms_acceptances_own on public.terms_acceptances for select using (user_id = auth.uid());
revoke all on public.terms_acceptances from public, anon, authenticated, service_role;
grant select on public.terms_acceptances to authenticated;
grant select, insert on public.terms_acceptances to service_role;

-- The signed-in person accepts terms version p_version (the app calls this when they tick the box). The time is the
-- database's; the address and browser come from the request PostgREST passes on, when there is one.
create or replace function public.accept_terms(p_version text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); hdr json; ip text; ua text;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_version is null or p_version !~ '^[A-Za-z0-9_.-]{1,32}$' then
    raise exception 'Unknown terms version' using errcode = '22023';
  end if;
  -- One record per person and version (the first acceptance): calling again changes nothing and can't fill the table.
  perform pg_advisory_xact_lock(hashtext('pinplan_terms'), hashtext(uid::text));
  if exists (select 1 from public.terms_acceptances a where a.user_id = uid and a.version = p_version) then return; end if;
  begin
    hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    hdr := null;
  end;
  ip := left(trim(split_part(coalesce(hdr ->> 'cf-connecting-ip', hdr ->> 'x-forwarded-for', hdr ->> 'x-real-ip', ''), ',', 1)), 64);
  ua := left(hdr ->> 'user-agent', 512);
  insert into public.terms_acceptances (user_id, version, ip, user_agent) values (uid, p_version, nullif(ip, ''), nullif(ua, ''));
end $$;

-- A new account: its address has now had a trial (used_trials), and terms ticked at sign-up (the metadata the
-- sign-up page or /api/team/join sends: terms_version, terms_accepted_at) are recorded. Never blocks the sign-up.
-- Reads the row as JSON so it works whatever auth.users' columns are.
create or replace function public.auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); meta jsonb; v text; h text;
begin
  begin
    h := public.email_hash(j ->> 'email');
    if h is not null then
      insert into public.used_trials (email_hash) values (h) on conflict (email_hash) do nothing;
    end if;
  exception when others then
    raise warning 'used_trials not recorded: %', sqlerrm;
  end;
  begin
    meta := coalesce(j -> 'raw_user_meta_data', '{}'::jsonb);
    v := meta ->> 'terms_version';
    if (meta ? 'terms_accepted_at' or meta ? 'terms_version') then
      if v is null or v !~ '^[A-Za-z0-9_.-]{1,32}$' then v := 'unknown'; end if;
      insert into public.terms_acceptances (user_id, version) values (new.id, v);
    end if;
  exception when others then
    raise warning 'terms acceptance not recorded: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists pinplan_auth_user_created on auth.users;
create trigger pinplan_auth_user_created after insert on auth.users
  for each row execute function public.auth_user_created();

-- ---------- grants ----------
revoke all on function public.email_normalize(text) from public, anon, authenticated;
revoke all on function public.email_hash(text) from public, anon, authenticated;
grant execute on function public.email_normalize(text) to service_role;
grant execute on function public.email_hash(text) to service_role;
revoke all on function public.email_send_reserve(uuid, text, text) from public, anon, authenticated;
grant execute on function public.email_send_reserve(uuid, text, text) to service_role;
revoke all on function public.team_invites_emailed_guard() from public, anon, authenticated;
revoke all on function public.team_invites_open_cap() from public, anon, authenticated;
revoke all on function public.teams_trial_policy() from public, anon, authenticated;
revoke all on function public.auth_user_created() from public, anon, authenticated;
revoke all on function public.solo_trial_ends_at(uuid) from public, anon, authenticated;
grant execute on function public.solo_trial_ends_at(uuid) to service_role;
revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

notify pgrst, 'reload schema';
