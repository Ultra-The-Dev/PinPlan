-- Technicians can't read prices; the server keeps the newer copy of a row. Safe to run more than once.
--
-- ============================== CONTRACT (web sync and the iPad app build against this) ==============================
-- Price tables (office only: owner and admins, or someone working alone; a technician reads 0 rows and can't write):
--   device_type_prices   (owner_id uuid, device_type_id text, unit_price float8, labor_price float8, billdu_product_id bigint,
--                         updated_at timestamptz, synced_at timestamptz)          primary key (owner_id, device_type_id)
--   product_prices       (owner_id uuid, product_id text, unit_price float8, labor_price float8,
--                         updated_at timestamptz, synced_at timestamptz)          primary key (owner_id, product_id)
--   project_finance      (project_id text, pricing jsonb, billdu_docs jsonb, billdu_client_id bigint,
--                         updated_at timestamptz, synced_at timestamptz)          primary key (project_id)
--   job_template_pricing (template_id text, owner_id uuid, pricing jsonb, updated_at timestamptz, synced_at timestamptz)
--                         primary key (template_id); pricing = { "estimateLines": [...], "pricing": {...} } (keys of the
--                         template payload: payload.estimateLines and payload.project.pricing). owner_id is set here.
-- Upsert conflict targets: "owner_id,device_type_id", "owner_id,product_id", "project_id", "template_id".
-- owner_id defaults to the signed-in user (like device_types and products); pull with synced_at >= watermark and merge
-- into the catalog / product / job row with the same (owner_id, id) by updated_at. Only office roles pull them.
--
-- Legacy columns: device_types.(unit_price, labor_price, billdu_product_id), products.(unit_price, labor_price) and
-- projects.(pricing, billdu_docs, billdu_client_id) stay writable for app builds that aren't updated: whatever is
-- written there moves into the tables above (0 / null / [] counts as "not sent") and the columns are stored blank
-- (section 4 says why this and not a column REVOKE). Clients NEVER select '*' on device_types, products or projects
-- and never read those columns: list the columns they need.
-- job_templates.payload never holds estimateLines or project.pricing on the server (estimateLines comes back as []).
--
-- Stale writes: on every synced table an app write (role authenticated/anon) whose updated_at is older than the
-- server's row is ignored (the server keeps its row and stamps it a little newer, so the writer pulls it back), and an
-- updated_at more than 5 minutes ahead of the server clock is cut to now() + 5 minutes.
-- =====================================================================================================================

-- ---------- 1. price tables ----------
create table if not exists public.device_type_prices (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_type_id text not null,
  unit_price double precision not null default 0,
  labor_price double precision not null default 0,
  billdu_product_id bigint,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  primary key (owner_id, device_type_id),
  foreign key (owner_id, device_type_id) references public.device_types (owner_id, id) on delete cascade deferrable initially deferred
);

create table if not exists public.product_prices (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id text not null,
  unit_price double precision not null default 0,
  labor_price double precision not null default 0,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  primary key (owner_id, product_id),
  foreign key (owner_id, product_id) references public.products (owner_id, id) on delete cascade deferrable initially deferred
);

create table if not exists public.project_finance (
  project_id text primary key references public.projects (id) on delete cascade deferrable initially deferred,
  pricing jsonb,
  billdu_docs jsonb not null default '[]'::jsonb,
  billdu_client_id bigint,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create table if not exists public.job_template_pricing (
  -- Deferred: the job_templates trigger below files a template's pricing before the template row itself is written.
  template_id text primary key references public.job_templates (id) on delete cascade deferrable initially deferred,
  owner_id uuid,
  pricing jsonb not null default '{}'::jsonb check (jsonb_typeof(pricing) = 'object' and pg_column_size(pricing) <= 1048576),
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['device_type_prices', 'product_prices', 'project_finance', 'job_template_pricing'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_synced_at', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_synced_at()', t || '_synced_at', t);
    execute format('create index if not exists %I on public.%I (synced_at)', t || '_synced_at_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- 2. who reads and writes prices: the office, never a technician ----------
drop policy if exists device_type_prices_read on public.device_type_prices;
create policy device_type_prices_read on public.device_type_prices for select to authenticated
  using (public.same_team(owner_id) and not public.is_tech());
drop policy if exists device_type_prices_write on public.device_type_prices;
create policy device_type_prices_write on public.device_type_prices for all to authenticated
  using (owner_id = auth.uid() and not public.is_tech())
  with check (owner_id = auth.uid() and not public.is_tech());

drop policy if exists product_prices_read on public.product_prices;
create policy product_prices_read on public.product_prices for select to authenticated
  using (public.same_team(owner_id) and not public.is_tech());
drop policy if exists product_prices_write on public.product_prices;
create policy product_prices_write on public.product_prices for all to authenticated
  using (owner_id = auth.uid() and not public.is_tech())
  with check (owner_id = auth.uid() and not public.is_tech());

drop policy if exists project_finance_office on public.project_finance;
create policy project_finance_office on public.project_finance for all to authenticated
  using (public.is_project_member(project_id) and not public.is_tech())
  with check (public.is_project_member(project_id) and not public.is_tech());

-- A template's pricing: whoever can see the template and isn't a technician reads it; whoever may edit it writes it.
drop policy if exists job_template_pricing_read on public.job_template_pricing;
create policy job_template_pricing_read on public.job_template_pricing for select to authenticated
  using (not public.is_tech() and exists (select 1 from public.job_templates t where t.id = template_id));
drop policy if exists job_template_pricing_write on public.job_template_pricing;
create policy job_template_pricing_write on public.job_template_pricing for all to authenticated
  using (not public.is_tech() and exists (
    select 1 from public.job_templates t where t.id = template_id and (
      (t.team_id is not null and t.team_id = public.my_team_id() and public.my_team_role() in ('owner', 'admin'))
      or (t.team_id is null and t.created_by = auth.uid()))))
  with check (not public.is_tech() and exists (
    select 1 from public.job_templates t where t.id = template_id and (
      (t.team_id is not null and t.team_id = public.my_team_id() and public.my_team_role() in ('owner', 'admin'))
      or (t.team_id is null and t.created_by = auth.uid()))));

-- The owner of a template's pricing comes from the template (whatever the app sends is ignored).
create or replace function public.job_template_pricing_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select public.job_template_owner(t.team_id, t.created_by) into o from public.job_templates t where t.id = new.template_id;
  -- Not found: the template is being written in this same statement (job_templates_strip_pricing set the owner).
  if found then new.owner_id := o; end if;
  return new;
end $$;
drop trigger if exists job_template_pricing_owner on public.job_template_pricing;
create trigger job_template_pricing_owner before insert or update on public.job_template_pricing
  for each row execute function public.job_template_pricing_owner();

-- A lapsed subscription makes a job's pricing read-only like the rest of the job.
drop trigger if exists project_finance_write_guard on public.project_finance;
create trigger project_finance_write_guard before insert or update on public.project_finance
  for each row execute function public.job_write_guard();

-- ---------- 3. backfill ----------
insert into public.device_type_prices (owner_id, device_type_id, unit_price, labor_price, billdu_product_id, updated_at)
  select owner_id, id, unit_price, labor_price, billdu_product_id, updated_at from public.device_types
  on conflict do nothing;
insert into public.product_prices (owner_id, product_id, unit_price, labor_price, updated_at)
  select owner_id, id, unit_price, labor_price, updated_at from public.products
  on conflict do nothing;
insert into public.project_finance (project_id, pricing, billdu_docs, billdu_client_id, updated_at)
  select id, pricing, coalesce(billdu_docs, '[]'::jsonb), billdu_client_id, updated_at from public.projects
  on conflict do nothing;

-- What a template payload holds that is about money.
create or replace function public.template_pricing_of(p jsonb) returns jsonb
language sql immutable as $$
  select case when p ? 'estimateLines' then jsonb_build_object('estimateLines', p -> 'estimateLines') else '{}'::jsonb end
      || case when coalesce(p -> 'project', 'null'::jsonb) ? 'pricing' then jsonb_build_object('pricing', p -> 'project' -> 'pricing') else '{}'::jsonb end;
$$;
-- The payload without it (estimateLines stays as an empty list: the apps expect the key).
create or replace function public.template_payload_without_pricing(p jsonb) returns jsonb
language sql immutable as $$
  select case when p ? 'estimateLines' then jsonb_set(p, '{estimateLines}', '[]'::jsonb) else p end #- '{project,pricing}';
$$;
create or replace function public.template_has_pricing(p jsonb) returns boolean
language sql immutable as $$
  select (p ? 'estimateLines' and p -> 'estimateLines' <> '[]'::jsonb) or coalesce(p -> 'project', 'null'::jsonb) ? 'pricing';
$$;

insert into public.job_template_pricing (template_id, owner_id, pricing, updated_at)
  select id, public.job_template_owner(team_id, created_by), public.template_pricing_of(payload), updated_at
  from public.job_templates where public.template_has_pricing(payload)
  on conflict do nothing;
update public.job_templates set payload = public.template_payload_without_pricing(payload) where public.template_has_pricing(payload);

-- ---------- 4. the old price columns: written by old app builds, never kept ----------
-- Office apps that aren't updated (older iPad builds) still send prices on the catalog, products and jobs. A BEFORE
-- trigger moves whatever they send into the price tables and stores the old columns blank (0 / null / []), so a
-- technician, who reads device_types, products and projects for the plans, finds no price there.
-- Why not REVOKE SELECT on those columns: every app upsert (PostgREST: ON CONFLICT DO UPDATE SET col = EXCLUDED.col)
-- needs SELECT on each column it sends, so old builds could no longer save a device type or a job at all
-- (prices_sync_test.sql checks such an upsert). Blank columns keep them saving and hide the prices just the same.
-- A blank value (0, null, []) on the old columns means "not sent": it never replaces a price, so an old build that
-- read the blank columns and saves the row again can't wipe the prices. The older copy never replaces a newer one.
-- Technicians' price edits are dropped (as projects_tech_guard did before).
create or replace function public.device_types_price_sink() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (coalesce(new.unit_price, 0) <> 0 or coalesce(new.labor_price, 0) <> 0 or new.billdu_product_id is not null)
     and not public.is_tech() then
    insert into public.device_type_prices as p (owner_id, device_type_id, unit_price, labor_price, billdu_product_id, updated_at)
    values (new.owner_id, new.id, coalesce(new.unit_price, 0), coalesce(new.labor_price, 0), new.billdu_product_id, new.updated_at)
    on conflict (owner_id, device_type_id) do update
      set unit_price = excluded.unit_price, labor_price = excluded.labor_price, billdu_product_id = excluded.billdu_product_id,
          updated_at = excluded.updated_at
      where p.updated_at <= excluded.updated_at;
  end if;
  new.unit_price := 0;
  new.labor_price := 0;
  new.billdu_product_id := null;
  return new;
end $$;

create or replace function public.products_price_sink() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (coalesce(new.unit_price, 0) <> 0 or coalesce(new.labor_price, 0) <> 0) and not public.is_tech() then
    insert into public.product_prices as p (owner_id, product_id, unit_price, labor_price, updated_at)
    values (new.owner_id, new.id, coalesce(new.unit_price, 0), coalesce(new.labor_price, 0), new.updated_at)
    on conflict (owner_id, product_id) do update
      set unit_price = excluded.unit_price, labor_price = excluded.labor_price, updated_at = excluded.updated_at
      where p.updated_at <= excluded.updated_at;
  end if;
  new.unit_price := 0;
  new.labor_price := 0;
  return new;
end $$;

-- A job's pricing and its Billdu links are separate things: each is copied only when sent.
create or replace function public.projects_price_sink() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  has_pricing boolean := new.pricing is not null and new.pricing <> 'null'::jsonb;
  has_docs boolean := coalesce(new.billdu_docs, '[]'::jsonb) <> '[]'::jsonb;
  has_client boolean := new.billdu_client_id is not null;
begin
  if (has_pricing or has_docs or has_client) and not public.is_tech() then
    insert into public.project_finance as f (project_id, pricing, billdu_docs, billdu_client_id, updated_at)
    values (new.id, case when has_pricing then new.pricing end, case when has_docs then new.billdu_docs else '[]'::jsonb end,
            new.billdu_client_id, new.updated_at)
    on conflict (project_id) do update
      set pricing = case when has_pricing then excluded.pricing else f.pricing end,
          billdu_docs = case when has_docs then excluded.billdu_docs else f.billdu_docs end,
          billdu_client_id = case when has_client then excluded.billdu_client_id else f.billdu_client_id end,
          updated_at = excluded.updated_at
      where f.updated_at <= excluded.updated_at;
  end if;
  new.pricing := null;
  new.billdu_docs := '[]'::jsonb;
  new.billdu_client_id := null;
  return new;
end $$;

-- Names start with "<table>_b_": after the stale-write guard ("<table>_a_", section 5), before the table's other triggers.
drop trigger if exists device_types_b_price_sink on public.device_types;
create trigger device_types_b_price_sink before insert or update on public.device_types
  for each row execute function public.device_types_price_sink();
drop trigger if exists products_b_price_sink on public.products;
create trigger products_b_price_sink before insert or update on public.products
  for each row execute function public.products_price_sink();
drop trigger if exists projects_b_price_sink on public.projects;
create trigger projects_b_price_sink before insert or update on public.projects
  for each row execute function public.projects_price_sink();

-- What is there now was copied above (section 3): blank it. Run as the database owner, so no app check applies.
update public.device_types set unit_price = 0, labor_price = 0, billdu_product_id = null
  where unit_price <> 0 or labor_price <> 0 or billdu_product_id is not null;
update public.products set unit_price = 0, labor_price = 0 where unit_price <> 0 or labor_price <> 0;
update public.projects set pricing = null, billdu_docs = '[]'::jsonb, billdu_client_id = null
  where pricing is not null or billdu_docs <> '[]'::jsonb or billdu_client_id is not null;

-- Templates: the money parts move to job_template_pricing on every write (by the office: a technician can't write
-- templates). BEFORE, so the payload is stored without them; the name sorts after job_templates_scope (team set) and
-- before job_templates_synced_at. A write the policies refuse rolls the copy back with it.
create or replace function public.job_templates_strip_pricing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (new.payload ? 'estimateLines' or coalesce(new.payload -> 'project', 'null'::jsonb) ? 'pricing') then return new; end if;
  -- Stored payloads never hold pricing, so an unchanged one (e.g. a stale write turned back) has nothing to move.
  if tg_op = 'UPDATE' and new.payload is not distinct from old.payload then return new; end if;
  insert into public.job_template_pricing as p (template_id, owner_id, pricing, updated_at)
  values (new.id, public.job_template_owner(new.team_id, new.created_by), public.template_pricing_of(new.payload), new.updated_at)
  on conflict (template_id) do update
    set pricing = excluded.pricing, owner_id = excluded.owner_id, updated_at = excluded.updated_at
    where p.updated_at <= excluded.updated_at;
  new.payload := public.template_payload_without_pricing(new.payload);
  return new;
end $$;
drop trigger if exists job_templates_strip_pricing on public.job_templates;
create trigger job_templates_strip_pricing before insert or update on public.job_templates
  for each row execute function public.job_templates_strip_pricing();

-- ---------- 5. the newer copy wins on the server ----------
-- Last write wins by updated_at on every device, but the server used to take whatever arrived: a device that had been
-- offline could push its old copy of a row (a device deleted meanwhile came back). Trigger names start with
-- "<table>_a_" so they run before the table's other BEFORE triggers (and before <table>_synced_at).
create or replace function public.stale_write_guard() returns trigger
-- Invoker rights on purpose: only app writes (authenticated/anon) are checked; the server and our own functions aren't.
language plpgsql set search_path = public as $$
declare horizon timestamptz := now() + interval '5 minutes';
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.updated_at > horizon then new.updated_at := horizon; end if;
  -- A server copy stamped beyond the horizon (a device clock far ahead, before this guard) doesn't lock the row.
  if tg_op = 'UPDATE' and coalesce(tg_argv[0], '') <> 'clamp_only'
     and new.updated_at < old.updated_at and old.updated_at <= horizon then
    new := old;
    new.updated_at := greatest(now(), old.updated_at + interval '1 millisecond');
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  -- The synced tables (src/lib/syncMap.ts TABLES) and the price tables.
  foreach t in array array['projects', 'sheets', 'device_types', 'products', 'markers', 'runs', 'closets', 'estimate_lines',
                           'photos', 'photo_comments', 'checklists', 'job_logs', 'job_documents', 'sales_document_payments',
                           'job_templates', 'schedule_items', 'job_forms', 'measurements', 'sheet_links', 'tasks',
                           'plan_markups', 'device_type_prices', 'product_prices', 'project_finance', 'job_template_pricing'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists %I on public.%I', t || '_a_stale_guard', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.stale_write_guard()', t || '_a_stale_guard', t);
  end loop;
  -- These already keep their own server-side fields and stamp updated_at themselves: only cut far-future stamps.
  foreach t in array array['rfis', 'change_orders', 'sales_documents'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists %I on public.%I', t || '_a_stale_guard', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.stale_write_guard(''clamp_only'')', t || '_a_stale_guard', t);
  end loop;
end $$;

revoke all on function public.stale_write_guard() from public, anon;
revoke all on function public.device_types_price_sink(), public.products_price_sink(), public.projects_price_sink(),
  public.job_templates_strip_pricing(), public.job_template_pricing_owner() from public, anon;

notify pgrst, 'reload schema';
