-- Operations: client error reports (web now, iOS later). No third-party error service needed.
--
-- Anyone running the app (signed in or not) may INSERT a report; nobody can read them through the API.
-- The platform admin dashboard (/admin) reads them server-side with the service-role key.
--
-- Columns a client sends (all optional except message):
--   message     text   ≤ 2000 chars   the error message ("TypeError: x is undefined")
--   stack       text   ≤ 16000 chars  stack trace
--   url         text   ≤ 2000 chars   page / screen where it happened — strip query strings and tokens first
--   user_agent  text   ≤ 512 chars    browser UA, or e.g. "PinPlan-iOS/1.4 (iPhone15,2; iOS 19.1)"
--   app_version text   ≤ 64 chars     build / version string
--   platform    text   1–32 chars of [a-z0-9_-]   'web', 'ios', 'android', 'server'
--   context     jsonb  object ≤ 8 KB  anything else (kind, component stack, sync state…); never secrets or customer data
-- user_id is filled from the caller's token (auth.uid()); a client can't report as someone else.
--
-- iOS (supabase-swift): try await client.from("app_errors").insert(report)   // no .select(): there is no read access
-- REST: POST {SUPABASE_URL}/rest/v1/app_errors  headers: apikey, Authorization: Bearer <user token or anon key>,
--       Content-Type: application/json, Prefer: return=minimal
--
-- A trigger drops reports silently (no error to the client) when more than 300 arrived in the last 5 minutes, so a
-- crash loop on many devices can't fill the database, and prunes reports older than 90 days. Safe to run more than once.

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  message text not null check (char_length(message) between 1 and 2000),
  stack text check (char_length(stack) <= 16000),
  url text check (char_length(url) <= 2000),
  user_agent text check (char_length(user_agent) <= 512),
  app_version text check (char_length(app_version) <= 64),
  platform text check (platform ~ '^[a-z0-9_-]{1,32}$'),
  context jsonb check (context is null or (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 8192))
);
create index if not exists app_errors_created_idx on public.app_errors (created_at desc);

alter table public.app_errors enable row level security;

-- Insert only. No select/update/delete policies: reports are write-only from the apps.
drop policy if exists app_errors_insert on public.app_errors;
create policy app_errors_insert on public.app_errors for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

revoke all on public.app_errors from anon, authenticated;
grant insert on public.app_errors to anon, authenticated;

create or replace function public.app_errors_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Never trust a client-supplied timestamp or another user's id.
  new.created_at := now();
  new.user_id := auth.uid();
  if (select count(*) from public.app_errors where created_at > now() - interval '5 minutes') >= 300 then
    return null; -- flood: drop quietly
  end if;
  if random() < 0.01 then
    delete from public.app_errors where created_at < now() - interval '90 days';
  end if;
  return new;
end $$;
revoke all on function public.app_errors_guard() from public, anon, authenticated;

drop trigger if exists app_errors_guard on public.app_errors;
create trigger app_errors_guard before insert on public.app_errors
  for each row execute function public.app_errors_guard();
