-- Count pins ("Add by count"): one placed device can stand for several devices of its type on its sheet, e.g. 12
-- windows, so a contractor doesn't have to pin every one. markers.count is 2…9999; null means one device (every row
-- placed before this). The takeoff, estimate, exports and alarm sensors multiply by it (src/lib/markerCount.ts,
-- PinPlanCore Marker.quantity). markers are already covered by RLS (is_project_member) and job_write_guard; nothing
-- else copies markers in SQL (duplicate job / templates copy whole rows in the apps). Safe to run more than once.

alter table public.markers add column if not exists count integer;
alter table public.markers drop constraint if exists markers_count_check;
alter table public.markers add constraint markers_count_check check (count is null or count between 2 and 9999);

-- ---------- schema version ----------
create or replace function public.schema_version() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v text := '20261125003000_marker_count';
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

notify pgrst, 'reload schema';
