-- Operations hardening: error reports can't be flooded by one device or silence server errors, rows are smaller,
-- and the server can check that the database has the migrations its code needs (public.schema_version()).
-- Safe to run more than once.
--
-- app_errors caps, per 5 minutes (reports over a cap are dropped quietly; the client gets no error):
--   one signed-in user                      20
--   one signed-out device (hashed address)  10   key = md5(first x-forwarded-for address + today's date): it changes
--                                                daily, can't be reversed to an address, and nobody can read it via the API
--   all signed-out reports together        100
--   all app reports together (as before)   300   server reports don't count towards this one …
--   server reports (service role only)     100   … and have their own, so an app crash loop can't hide server errors
-- Only the service role may file a report as platform 'server' (or for a given user_id); anyone else claiming 'server'
-- is dropped.
--
-- Size clamp (tighter than the column checks, applied before them so nothing is rejected): message 1000 chars,
-- stack 8000, url 1000, user_agent 256, app_version 64; context over 4 KB becomes {"truncated": true}.

alter table public.app_errors add column if not exists client_key text;
create index if not exists app_errors_user_idx on public.app_errors (user_id, created_at desc) where user_id is not null;
create index if not exists app_errors_client_idx on public.app_errors (client_key, created_at desc) where client_key is not null;
create index if not exists app_errors_platform_idx on public.app_errors (platform, created_at desc);

create or replace function public.app_errors_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  since constant timestamptz := now() - interval '5 minutes';
  is_service boolean := coalesce(auth.role(), '') = 'service_role';
  fwd text;
begin
  -- Never trust a client-supplied timestamp or another user's id.
  new.created_at := now();
  if not is_service then
    new.user_id := auth.uid();
    if new.platform = 'server' then return null; end if; -- only the server reports server errors
  end if;
  new.client_key := null;

  -- Smaller rows.
  new.message := left(coalesce(nullif(new.message, ''), 'Unknown error'), 1000);
  new.stack := left(new.stack, 8000);
  new.url := left(new.url, 1000);
  new.user_agent := left(new.user_agent, 256);
  new.app_version := left(new.app_version, 64);
  if new.context is not null and (jsonb_typeof(new.context) <> 'object' or pg_column_size(new.context) > 4096) then
    new.context := jsonb_build_object('truncated', true);
  end if;

  if new.platform = 'server' then
    if (select count(*) from public.app_errors where platform = 'server' and created_at > since) >= 100 then return null; end if;
    return new;
  end if;

  -- Global cap for everything the apps send.
  if (select count(*) from public.app_errors where created_at > since and platform is distinct from 'server') >= 300 then
    return null;
  end if;
  if new.user_id is not null then
    if (select count(*) from public.app_errors where user_id = new.user_id and created_at > since) >= 20 then return null; end if;
  else
    if (select count(*) from public.app_errors where user_id is null and created_at > since and platform is distinct from 'server') >= 100 then
      return null;
    end if;
    begin
      fwd := nullif(trim(split_part(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-forwarded-for', ',', 1)), '');
    exception when others then
      fwd := null;
    end;
    if fwd is not null then
      new.client_key := md5(fwd || '|' || current_date::text);
      if (select count(*) from public.app_errors where client_key = new.client_key and created_at > since) >= 10 then return null; end if;
    end if;
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

-- ---------- schema version ----------
-- The newest migration this database has, as '<14-digit version>_<name>'. /api/health compares it with the version the
-- deployed code needs (REQUIRED_SCHEMA_VERSION in src/lib/server/envCheck.ts) and answers 503 when the database is
-- behind. When the Supabase CLI recorded migrations (supabase_migrations.schema_migrations), the newest one there counts
-- too; otherwise the value below is what a migration last set. A later migration the code depends on redefines this
-- function with its own name (and bumps the constant).
create or replace function public.schema_version() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v text := '20261124100800_ops_hardening';
  recorded text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    begin
      execute 'select version || coalesce(''_'' || name, '''') from supabase_migrations.schema_migrations order by version desc limit 1'
        into recorded;
    exception when others then
      recorded := null;
    end;
    if recorded is not null and left(recorded, 14) > left(v, 14) then v := recorded; end if;
  end if;
  return v;
end $$;
revoke all on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated, service_role;
