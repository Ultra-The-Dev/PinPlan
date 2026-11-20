-- Server API hardening. Safe to run more than once.
--
-- 1. rate_limits + rate_limit_hit(): a shared, durable request counter for the server's API routes (sign-up with an
--    invite code, Billdu save / test / send / products). The in-memory limiter in src/lib/server/rateLimit.ts only
--    counts per server instance; on Vercel every instance and region has its own memory, so a determined caller could
--    spread requests across instances. This table is the one place all instances count. Only the server (service
--    role) may call the function; browsers can't read, write or reset counts.
--
-- 2. team_invites.email / created_user_id / signup_claimed_at: /api/team/join creates at most one account per invite
--    code, and when the invite was sent to an email address, only for that address.

-- ---------- 1. rate limits ----------

-- Fixed windows: one row per key and window. `expires_at` lets old rows be cleaned up.
create table if not exists public.rate_limits (
  key text not null check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  hits int not null default 0 check (hits >= 0),
  expires_at timestamptz not null,
  primary key (key, window_start)
);
create index if not exists rate_limits_expires_idx on public.rate_limits (expires_at);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.rate_limits to service_role;

-- Count one request for `p_key` in the current `p_window_seconds` window and say whether it is allowed (at most
-- `p_max` per window). Atomic: the insert … on conflict takes a row lock, so concurrent calls never both get the
-- last slot. Refused requests are counted too (a caller hammering past the limit stays limited).
-- Returns { ok, hits, limit, remaining, retry_after } (retry_after in whole seconds, 0 when ok).
create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_max int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w int := greatest(1, least(coalesce(p_window_seconds, 60), 7 * 24 * 3600));
  m int := greatest(0, coalesce(p_max, 0));
  start timestamptz := to_timestamp(floor(extract(epoch from now()) / w) * w);
  n int;
begin
  if p_key is null or char_length(p_key) not between 1 and 200 then
    raise exception 'rate limit key must be 1-200 characters' using errcode = '22023';
  end if;
  insert into public.rate_limits as r (key, window_start, hits, expires_at)
    values (p_key, start, 1, start + make_interval(secs => w))
    on conflict (key, window_start) do update set hits = r.hits + 1
    returning hits into n;
  -- Now and then, forget windows that are over (keeps the table small without a scheduled job).
  if random() < 0.01 then
    delete from public.rate_limits where expires_at < now() - interval '1 minute';
  end if;
  return jsonb_build_object(
    'ok', n <= m,
    'hits', n,
    'limit', m,
    'remaining', greatest(0, m - n),
    'retry_after', case when n <= m then 0 else greatest(1, ceil(extract(epoch from (start + make_interval(secs => w)) - now()))::int) end);
end $$;

revoke all on function public.rate_limit_hit(text, int, int) from public;
revoke execute on function public.rate_limit_hit(text, int, int) from anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- ---------- 2. invite codes: one account each, optionally for one email ----------

-- The address the invite was sent to (lower case). When set, /api/team/join only creates an account for it.
alter table public.team_invites add column if not exists email text;
alter table public.team_invites drop constraint if exists team_invites_email_check;
alter table public.team_invites add constraint team_invites_email_check
  check (email is null or (char_length(email) <= 254 and email = lower(email) and position('@' in email) > 1));
-- The account /api/team/join created with this code. Once set, the code creates no more accounts.
alter table public.team_invites add column if not exists created_user_id uuid references auth.users (id) on delete set null;
-- Held while /api/team/join is creating that account, so two sign-ups with one code can't race.
alter table public.team_invites add column if not exists signup_claimed_at timestamptz;

-- created_user_id and signup_claimed_at belong to /api/team/join (service role). Team owners and admins may write
-- their invites (team_invites_admin), but not these two: otherwise clearing created_user_id would turn one code into
-- many accounts. Invoker rights on purpose (as teams_billing_guard): writes straight from the apps run as
-- `authenticated`; the service role, the SQL editor and security-definer functions pass.
create or replace function public.team_invites_signup_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.created_user_id := null;
    new.signup_claimed_at := null;
  else
    new.created_user_id := old.created_user_id;
    new.signup_claimed_at := old.signup_claimed_at;
  end if;
  return new;
end $$;
drop trigger if exists team_invites_signup_guard on public.team_invites;
create trigger team_invites_signup_guard before insert or update on public.team_invites
  for each row execute function public.team_invites_signup_guard();

notify pgrst, 'reload schema';
