-- Email abuse limits and answer notifications. Safe to run more than once.
--
-- Every email PinPlan sends for a company is written to email_sends (who, what kind, a hash of the address, Resend's
-- id), so a company can't use PinPlan to send unlimited mail to strangers. The server reserves a send with
-- email_send_reserve() before it calls Resend: that checks the sender's email is confirmed, the company's subscription
-- lets it work, and the daily cap for the kind of email, all under one lock so two requests can't both take the last
-- slot. Only the server (service role) can read or write any of it. src/lib/server/sendGuard.ts calls these.
--
-- Also: response_notified_at on change_orders and rfis (the office is emailed once when a client answers a link), and
-- answer_rate_hit(), a durable per-key limit for the public answer pages.

-- ---------- the send log ----------
create table if not exists public.email_sends (
  id bigint generated always as identity primary key,
  team_id uuid references public.teams (id) on delete set null,
  -- Who sent it (null for notifications a client's answer set off).
  user_id uuid,
  kind text not null check (kind in ('document', 'reminder', 'receipt', 'invite', 'welcome', 'notify')),
  -- sha256 of the lower-cased address: enough to count repeats, never the address itself.
  recipient_hash text not null check (char_length(recipient_hash) between 16 and 128),
  resend_id text check (resend_id is null or char_length(resend_id) <= 128),
  created_at timestamptz not null default now()
);
create index if not exists email_sends_team_idx on public.email_sends (team_id, created_at);
create index if not exists email_sends_user_idx on public.email_sends (user_id, created_at);
create index if not exists email_sends_recipient_idx on public.email_sends (recipient_hash, created_at);

alter table public.email_sends enable row level security;
-- No policies: the apps never see it.
revoke all on public.email_sends from anon, authenticated;
grant select, insert, update, delete on public.email_sends to service_role;

-- ---------- daily caps ----------
-- Per company per rolling 24 hours. A trial is a free account anyone can open, so it gets a small allowance; paying
-- (and comped) companies get room for a busy office. Solo accounts (no company) count as a trial.
create or replace function public.email_daily_cap(p_kind text, p_trial boolean) returns int
language sql immutable set search_path = public as $$
  select case
    when p_kind in ('document', 'reminder', 'receipt') then case when p_trial then 20 else 300 end
    when p_kind = 'invite' then case when p_trial then 10 else 50 end
    when p_kind = 'welcome' then 3
    else 0
  end;
$$;

-- The same address from one company per rolling 24 hours, whatever the kind (a brake on mail-bombing one person).
create or replace function public.email_recipient_cap(p_trial boolean) returns int
language sql immutable set search_path = public as $$
  select case when p_trial then 5 else 25 end;
$$;

-- ---------- reserve a send ----------
-- Returns {ok: true, id, team_id, trial, sent_today, cap} after writing the log row, or {ok: false, reason} where
-- reason is unconfirmed | plan_inactive | daily_cap | recipient_cap | bad_kind | no_user. The server fills in
-- resend_id after Resend answers, or deletes the row when the send failed so it doesn't use up the allowance.
create or replace function public.email_send_reserve(p_user uuid, p_kind text, p_recipient_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  confirmed timestamptz;
  found_user boolean;
  t public.teams;
  trial boolean;
  scope text;
  n int;
  r int;
  cap int;
  rcap int;
  new_id bigint;
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
  trial := t.id is null or t.plan_status in ('trialing', 'incomplete');

  -- One company (or solo account) at a time, so two requests can't both take the last slot.
  scope := coalesce(t.id::text, p_user::text);
  perform pg_advisory_xact_lock(hashtext('pinplan_email_sends'), hashtext(scope));

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

  insert into public.email_sends (team_id, user_id, kind, recipient_hash) values (t.id, p_user, p_kind, p_recipient_hash)
    returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id, 'team_id', t.id, 'trial', trial, 'sent_today', n + 1, 'cap', cap);
end $$;

-- ---------- log a notification ----------
-- Emails to the company itself (a client answered a link) aren't capped, only logged against the job owner's company.
create or replace function public.email_send_log(p_owner uuid, p_kind text, p_recipient_hash text, p_resend_id text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare tid uuid; new_id bigint;
begin
  select m.team_id into tid from public.team_members m where m.user_id = p_owner limit 1;
  insert into public.email_sends (team_id, user_id, kind, recipient_hash, resend_id)
    values (tid, null, coalesce(p_kind, 'notify'), p_recipient_hash, left(p_resend_id, 128))
    returning id into new_id;
  return new_id;
end $$;

-- ---------- durable limits for the public answer pages ----------
-- Counts hits per key (a hash of an IP address or a link token) in a rolling window; true when this hit is allowed
-- (and records it), false when the key is over the limit. Old hits for the key are cleared as it goes.
create table if not exists public.answer_rate_hits (
  key text not null check (char_length(key) between 8 and 200),
  created_at timestamptz not null default now()
);
create index if not exists answer_rate_hits_key_idx on public.answer_rate_hits (key, created_at);
alter table public.answer_rate_hits enable row level security;
revoke all on public.answer_rate_hits from anon, authenticated;
grant select, insert, delete on public.answer_rate_hits to service_role;

create or replace function public.answer_rate_hit(p_key text, p_window_seconds int, p_max int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_key is null or char_length(p_key) not between 8 and 200 or p_window_seconds is null or p_window_seconds < 1 or p_max is null or p_max < 1 then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('pinplan_answer_rate'), hashtext(p_key));
  delete from public.answer_rate_hits where key = p_key and created_at <= now() - make_interval(secs => greatest(p_window_seconds, 86400));
  select count(*) into n from public.answer_rate_hits where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then return false; end if;
  insert into public.answer_rate_hits (key) values (p_key);
  return true;
end $$;

-- ---------- answer notifications on change orders and RFIs ----------
-- When a client answers a change order or RFI from its link, the server emails the office once and stamps this, so a
-- repeat or a retry can't send twice. Only the server sets it: the apps push whole rows, so keep it out of their hands.
alter table public.change_orders add column if not exists response_notified_at timestamptz;
alter table public.rfis add column if not exists response_notified_at timestamptz;

create or replace function public.response_notified_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user in ('authenticated', 'anon') then
    new.response_notified_at := old.response_notified_at;
  end if;
  return new;
end $$;
drop trigger if exists change_orders_notified_guard on public.change_orders;
create trigger change_orders_notified_guard before update on public.change_orders
  for each row execute function public.response_notified_guard();
drop trigger if exists rfis_notified_guard on public.rfis;
create trigger rfis_notified_guard before update on public.rfis
  for each row execute function public.response_notified_guard();

-- ---------- server only ----------
revoke all on function public.email_daily_cap(text, boolean) from public, anon, authenticated;
revoke all on function public.email_recipient_cap(boolean) from public, anon, authenticated;
revoke all on function public.email_send_reserve(uuid, text, text) from public, anon, authenticated;
revoke all on function public.email_send_log(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.answer_rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.email_daily_cap(text, boolean) to service_role;
grant execute on function public.email_recipient_cap(boolean) to service_role;
grant execute on function public.email_send_reserve(uuid, text, text) to service_role;
grant execute on function public.email_send_log(uuid, text, text, text) to service_role;
grant execute on function public.answer_rate_hit(text, int, int) to service_role;

notify pgrst, 'reload schema';
