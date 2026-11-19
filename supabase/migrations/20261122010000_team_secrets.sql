-- Per-company secrets (the Billdu API key + secret): each company connects its own Billdu account instead of every
-- customer sending invoices into one server-wide account. Safe to run more than once.
--
-- team_secrets: one row per team and secret name (e.g. 'billdu').
-- user_secrets: the same for people who use PinPlan on their own, without a team.
--
-- `payload` is encrypted by the app (AES-256-GCM with PINPLAN_ENCRYPTION_KEY, bound to the owning team / user id so a
-- row copied to another team doesn't decrypt). Only the app's server routes read or write these tables, with the
-- service-role key: RLS is on and there are deliberately NO policies for anon/authenticated, and their table grants
-- are revoked. We chose this over "owner/admin can write, nobody can read" policies because a browser write would
-- skip the server's encryption and validation, and the server already checks the caller's role (techs are refused)
-- before it touches a row.
--
-- The older server-wide app_secrets row named 'billdu' (and BILLDU_API_KEY / BILLDU_API_SECRET) still works, but only
-- for the founder's company (team plan_status = 'comped') and for single-company servers (access code, no accounts).

create table if not exists public.team_secrets (
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  payload text not null,
  -- A safe-to-show hint of the API key (first 2 and last 4 characters), so the status needs no decryption.
  key_hint text check (key_hint is null or char_length(key_hint) <= 16),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text check (last_test_message is null or char_length(last_test_message) <= 500),
  primary key (team_id, name)
);

create table if not exists public.user_secrets (
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  payload text not null,
  key_hint text check (key_hint is null or char_length(key_hint) <= 16),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text check (last_test_message is null or char_length(last_test_message) <= 500),
  primary key (user_id, name)
);

alter table public.team_secrets enable row level security;
alter table public.user_secrets enable row level security;
revoke all on public.team_secrets from public, anon, authenticated;
revoke all on public.user_secrets from public, anon, authenticated;
grant select, insert, update, delete on public.team_secrets, public.user_secrets to service_role;

notify pgrst, 'reload schema';
