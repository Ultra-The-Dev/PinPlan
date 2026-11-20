-- Checks for 20261124300100_price_split_stale_writes.sql: technicians can't read prices (any price column, any price
-- table), old app builds' price writes still land, and the server keeps the newer copy of a row. Runs after the other
-- suites (its ids and users are its own). Any failed check raises an exception.
\set ON_ERROR_STOP on
-- Billing isn't what's tested here (another suite switches enforcement on).
update public.billing_settings set enforce = false;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000007a1', 'price-owner@example.com'),
                                          ('00000000-0000-0000-0000-0000000007a2', 'price-admin@example.com'),
                                          ('00000000-0000-0000-0000-0000000007a3', 'price-tech@example.com'),
                                          ('00000000-0000-0000-0000-0000000007a4', 'price-outsider@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'PRICES CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
create function pg_temp.n(stmt text) returns bigint language plpgsql as $$
declare c bigint;
begin
  execute 'select count(*) from (' || stmt || ') q' into c;
  return c;
end $$;
grant execute on function pg_temp.as_user(text), pg_temp.check(boolean, text), pg_temp.fails(text), pg_temp.n(text) to authenticated;

-- ---------- a company: owner (a1), admin (a2), tech (a3); a4 is an outsider ----------
-- The owner's catalog, a product, a priced job and a template, written the old way (prices on the legacy columns).
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000007a1');
insert into public.device_types (id, name, category, unit_price, labor_price, billdu_product_id, updated_at)
  values ('pr-cam', 'Camera', 'security', 250, 80, 4242, now() - interval '1 hour');
insert into public.products (id, device_type_id, brand, model, unit_price, labor_price, updated_at)
  values ('pr-prod', 'pr-cam', 'Acme', 'C1', 199, 60, now() - interval '1 hour');
insert into public.projects (id, client_name, address, status, pricing, billdu_docs, billdu_client_id, updated_at)
  values ('pr-p1', 'Client', '1 Price St', 'estimate', '{"markupPct": 30}', '[{"id": 1}]', 777, now() - interval '1 hour');
insert into public.sheets (id, project_id, name, page_number, sort_order, image_id, width, height)
  values ('pr-s1', 'pr-p1', 'Main', 1, 0, 'pr-img', 1000, 800);
select pg_temp.check(public.create_team('Price Test Co', 'Owner') is not null, 'owner starts a team');
insert into public.team_invites (code, team_id, role) values ('PRADMIN01', public.my_team_id(), 'admin'),
                                                            ('PRTECH001', public.my_team_id(), 'tech');
insert into public.job_templates (id, name, payload, updated_at)
  values ('pr-t1', 'Standard', '{"version": 1, "project": {"pricing": {"markupPct": 15}, "labels": ["x"]}, "checklists": [], "estimateLines": [{"key": "custom:a", "unitPrice": 99}]}', now() - interval '1 hour');
select pg_temp.as_user('00000000-0000-0000-0000-0000000007a2');
select public.accept_team_invite('PRADMIN01', 'Admin');
select pg_temp.as_user('00000000-0000-0000-0000-0000000007a3');
select public.accept_team_invite('PRTECH001', 'Tech');

-- ---------- old builds' writes land in the price tables ----------
reset role;
select pg_temp.check((select unit_price from public.device_type_prices where device_type_id = 'pr-cam') = 250
                     and (select billdu_product_id from public.device_type_prices where device_type_id = 'pr-cam') = 4242, 'catalog prices copied to device_type_prices');
select pg_temp.check((select labor_price from public.product_prices where product_id = 'pr-prod') = 60, 'product prices copied to product_prices');
select pg_temp.check((select pricing ->> 'markupPct' from public.project_finance where project_id = 'pr-p1') = '30'
                     and (select billdu_client_id from public.project_finance where project_id = 'pr-p1') = 777, 'job pricing copied to project_finance');
select pg_temp.check((select pricing -> 'estimateLines' -> 0 ->> 'unitPrice' from public.job_template_pricing where template_id = 'pr-t1') = '99'
                     and (select pricing -> 'pricing' ->> 'markupPct' from public.job_template_pricing where template_id = 'pr-t1') = '15', 'template estimate lines and pricing moved to job_template_pricing');
select pg_temp.check((select payload -> 'estimateLines' from public.job_templates where id = 'pr-t1') = '[]'::jsonb
                     and not (select payload -> 'project' ? 'pricing' from public.job_templates where id = 'pr-t1')
                     and (select payload -> 'project' -> 'labels' from public.job_templates where id = 'pr-t1') = '["x"]'::jsonb, 'template payload keeps no prices');
select pg_temp.check((select owner_id from public.job_template_pricing where template_id = 'pr-t1') = '00000000-0000-0000-0000-0000000007a1', 'template pricing belongs to the company owner');

-- ---------- a technician reads no price column and no price row ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000007a3');
-- The old price columns are readable (the plans need the rest of those rows) but always blank.
select pg_temp.check((select count(*) from public.device_types where id = 'pr-cam') = 1, 'tech sees the catalog row');
select pg_temp.check(pg_temp.n($$select 1 from public.device_types where unit_price <> 0$$) = 0, 'tech: device_types.unit_price is blank');
select pg_temp.check(pg_temp.n($$select 1 from public.device_types where labor_price <> 0$$) = 0, 'tech: device_types.labor_price is blank');
select pg_temp.check(pg_temp.n($$select 1 from public.device_types where billdu_product_id is not null$$) = 0, 'tech: device_types.billdu_product_id is blank');
select pg_temp.check(pg_temp.n($$select 1 from public.products where unit_price <> 0$$) = 0, 'tech: products.unit_price is blank');
select pg_temp.check(pg_temp.n($$select 1 from public.products where labor_price <> 0$$) = 0, 'tech: products.labor_price is blank');
select pg_temp.check(pg_temp.n($$select 1 from public.projects where pricing is not null$$) = 0, 'tech: projects.pricing is blank');
select pg_temp.check(pg_temp.n($$select 1 from public.projects where billdu_docs <> '[]'::jsonb$$) = 0, 'tech: projects.billdu_docs is blank');
select pg_temp.check(pg_temp.n($$select 1 from public.projects where billdu_client_id is not null$$) = 0, 'tech: projects.billdu_client_id is blank');
select pg_temp.check((select (to_jsonb(d) ->> 'unit_price')::float8 from public.device_types d where id = 'pr-cam') = 0, 'tech: select * on device_types shows no price');
select pg_temp.check(pg_temp.n($$select * from public.device_type_prices$$) = 0, 'tech: device_type_prices reads 0 rows');
select pg_temp.check(pg_temp.n($$select * from public.product_prices$$) = 0, 'tech: product_prices reads 0 rows');
select pg_temp.check(pg_temp.n($$select * from public.project_finance$$) = 0, 'tech: project_finance reads 0 rows');
select pg_temp.check(pg_temp.n($$select * from public.job_template_pricing$$) = 0, 'tech: job_template_pricing reads 0 rows');
select pg_temp.check(pg_temp.n($$select * from public.estimate_lines$$) = 0, 'tech: estimate_lines reads 0 rows');
select pg_temp.check((select payload::text from public.job_templates where id = 'pr-t1') not like '%99%', 'tech: template payload shows no prices');
-- What the plans need is still there.
select pg_temp.check((select name from public.device_types where id = 'pr-cam') = 'Camera', 'tech still reads the catalog (names, letters)');
select pg_temp.check((select model from public.products where id = 'pr-prod') = 'C1', 'tech still reads product names');
select pg_temp.check((select client_name from public.projects where id = 'pr-p1') = 'Client', 'tech still reads the job');
-- And can't write any.
select pg_temp.check(pg_temp.fails($$insert into public.device_type_prices (owner_id, device_type_id, unit_price) values ('00000000-0000-0000-0000-0000000007a1', 'pr-cam', 1)$$), 'tech can''t write device_type_prices');
select pg_temp.check(pg_temp.fails($$insert into public.project_finance (project_id, pricing) values ('pr-p1', '{}')$$), 'tech can''t write project_finance');
select pg_temp.check(pg_temp.fails($$insert into public.job_template_pricing (template_id, pricing) values ('pr-t1', '{}')$$), 'tech can''t write job_template_pricing');
update public.projects set pricing = '{"markupPct": 0}', billdu_client_id = 1, notes = 'tech note', updated_at = now() where id = 'pr-p1';
reset role;
select pg_temp.check((select pricing ->> 'markupPct' from public.project_finance where project_id = 'pr-p1') = '30'
                     and (select billdu_client_id from public.project_finance where project_id = 'pr-p1') = 777
                     and (select pricing from public.projects where id = 'pr-p1') is null, 'tech''s price edit on the job is ignored');
select pg_temp.check((select notes from public.projects where id = 'pr-p1') = 'tech note', 'tech still edits the job');

-- ---------- the office reads them; an outsider doesn't ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000007a2');
select pg_temp.check((select unit_price from public.device_type_prices where device_type_id = 'pr-cam') = 250, 'admin reads catalog prices');
select pg_temp.check((select pricing ->> 'markupPct' from public.project_finance where project_id = 'pr-p1') = '30', 'admin reads job pricing');
select pg_temp.check(pg_temp.n($$select * from public.job_template_pricing where template_id = 'pr-t1'$$) = 1, 'admin reads template pricing');
select pg_temp.check((select unit_price from public.device_types where id = 'pr-cam') = 0, 'admin: the old column is blank too (prices are in device_type_prices)');
select pg_temp.as_user('00000000-0000-0000-0000-0000000007a4');
select pg_temp.check(pg_temp.n($$select * from public.device_type_prices$$) = 0 and pg_temp.n($$select * from public.product_prices$$) = 0
                     and pg_temp.n($$select * from public.project_finance$$) = 0 and pg_temp.n($$select * from public.job_template_pricing$$) = 0, 'outsider reads no prices');

-- ---------- the owner's app: upserts like PostgREST (no RETURNING), legacy and new tables ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000007a1');
insert into public.device_types (id, name, category, unit_price, labor_price, updated_at) values ('pr-cam', 'Camera', 'security', 300, 90, now())
  on conflict (owner_id, id) do update set name = excluded.name, unit_price = excluded.unit_price, labor_price = excluded.labor_price, updated_at = excluded.updated_at;
select pg_temp.check((select unit_price from public.device_type_prices where device_type_id = 'pr-cam') = 300, 'owner''s legacy upsert updates device_type_prices');
select pg_temp.check((select unit_price from public.device_types where id = 'pr-cam') = 0, 'and the old column is stored blank');
-- An old build that read the blank columns saves the row again: the prices stay.
insert into public.device_types (id, name, category, unit_price, labor_price, updated_at) values ('pr-cam', 'Camera', 'security', 0, 0, now())
  on conflict (owner_id, id) do update set name = excluded.name, unit_price = excluded.unit_price, labor_price = excluded.labor_price, updated_at = excluded.updated_at;
select pg_temp.check((select unit_price from public.device_type_prices where device_type_id = 'pr-cam') = 300, 'blank old columns don''t wipe a price');
insert into public.projects (id, client_name, address, status, pricing, billdu_docs, updated_at) values ('pr-p1', 'Client', '1 Price St', 'estimate', '{"markupPct": 31}', '[]', now())
  on conflict (id) do update set pricing = excluded.pricing, billdu_docs = excluded.billdu_docs, updated_at = excluded.updated_at;
select pg_temp.check((select pricing ->> 'markupPct' from public.project_finance where project_id = 'pr-p1') = '31'
                     and (select billdu_docs from public.project_finance where project_id = 'pr-p1') = '[{"id": 1}]'::jsonb, 'job pricing sent alone keeps the Billdu links');
insert into public.device_type_prices (device_type_id, unit_price, labor_price, updated_at) values ('pr-cam', 310, 90, now())
  on conflict (owner_id, device_type_id) do update set unit_price = excluded.unit_price, labor_price = excluded.labor_price, updated_at = excluded.updated_at;
select pg_temp.check((select unit_price from public.device_type_prices where device_type_id = 'pr-cam') = 310, 'owner writes device_type_prices directly');
insert into public.project_finance (project_id, pricing, updated_at) values ('pr-p1', '{"markupPct": 35}', now())
  on conflict (project_id) do update set pricing = excluded.pricing, updated_at = excluded.updated_at;
select pg_temp.check((select pricing ->> 'markupPct' from public.project_finance where project_id = 'pr-p1') = '35', 'owner writes project_finance directly');
insert into public.job_template_pricing (template_id, owner_id, pricing, updated_at) values ('pr-t1', '00000000-0000-0000-0000-0000000007a4', '{"estimateLines": []}', now())
  on conflict (template_id) do update set pricing = excluded.pricing, owner_id = excluded.owner_id, updated_at = excluded.updated_at;
select pg_temp.check((select owner_id from public.job_template_pricing where template_id = 'pr-t1') = '00000000-0000-0000-0000-0000000007a1', 'template pricing keeps the company owner whatever is sent');
-- A stale price write (older than the server's) is ignored.
update public.device_type_prices set unit_price = 1, updated_at = now() - interval '2 hours' where device_type_id = 'pr-cam';
select pg_temp.check((select unit_price from public.device_type_prices where device_type_id = 'pr-cam') = 310, 'stale price write ignored');

-- ---------- stale writes: the newer copy wins on the server ----------
insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, updated_at) values ('pr-m1', 'pr-p1', 'pr-s1', 'pr-cam', 0.5, 0.5, '2026-01-01T10:00:00Z');
-- Device A deletes it at 10:05.
update public.markers set deleted = true, updated_at = '2026-01-01T10:05:00Z' where id = 'pr-m1';
-- Device B, offline since 10:00, pushes its old copy (upsert, as sync does).
insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, deleted, updated_at) values ('pr-m1', 'pr-p1', 'pr-s1', 'pr-cam', 0.9, 0.9, false, '2026-01-01T10:01:00Z')
  on conflict (id) do update set x = excluded.x, y = excluded.y, deleted = excluded.deleted, updated_at = excluded.updated_at;
select pg_temp.check((select deleted from public.markers where id = 'pr-m1') and (select x from public.markers where id = 'pr-m1') = 0.5, 'a stale push does not bring back a deleted marker');
select pg_temp.check((select updated_at from public.markers where id = 'pr-m1') > '2026-01-01T10:05:00Z', 'the kept row is stamped newer, so the stale device pulls it back');
-- A newer push still wins.
insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, deleted, updated_at) values ('pr-m1', 'pr-p1', 'pr-s1', 'pr-cam', 0.7, 0.7, false, now())
  on conflict (id) do update set x = excluded.x, y = excluded.y, deleted = excluded.deleted, updated_at = excluded.updated_at;
select pg_temp.check(not (select deleted from public.markers where id = 'pr-m1') and (select x from public.markers where id = 'pr-m1') = 0.7, 'a newer push still wins');
-- A device clock far ahead can't make its copy win for ever.
insert into public.markers (id, project_id, sheet_id, device_type_id, x, y, updated_at) values ('pr-m2', 'pr-p1', 'pr-s1', 'pr-cam', 0.1, 0.1, '2099-01-01T00:00:00Z');
select pg_temp.check((select updated_at from public.markers where id = 'pr-m2') <= now() + interval '5 minutes', 'a 2099 timestamp is clamped (insert)');
update public.markers set updated_at = '2099-01-01T00:00:00Z', x = 0.2 where id = 'pr-m1';
select pg_temp.check((select updated_at from public.markers where id = 'pr-m1') <= now() + interval '5 minutes', 'a 2099 timestamp is clamped (update)');
update public.projects set notes = 'stale', updated_at = '2000-01-01' where id = 'pr-p1';
select pg_temp.check((select notes from public.projects where id = 'pr-p1') = 'tech note', 'stale job write ignored');
-- A write that doesn't move updated_at (the sheet's image path after upload) still goes through.
update public.sheets set image_path = 'pr-p1/pr-img' where id = 'pr-s1';
select pg_temp.check((select image_path from public.sheets where id = 'pr-s1') = 'pr-p1/pr-img', 'same-stamp write still applies');
-- A stale template write doesn't wipe the template's pricing.
update public.job_templates set payload = '{"version": 1, "project": {}, "checklists": [], "estimateLines": []}', updated_at = '2000-01-01' where id = 'pr-t1';
reset role;
select pg_temp.check((select payload -> 'project' -> 'labels' from public.job_templates where id = 'pr-t1') = '["x"]'::jsonb, 'stale template write ignored');
-- The server and SQL editor aren't held to it.
update public.markers set x = 0.3, updated_at = '2000-01-01' where id = 'pr-m1';
select pg_temp.check((select x from public.markers where id = 'pr-m1') = 0.3, 'server writes are not checked');

-- Every synced table carries the guard.
select pg_temp.check((select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                      where t.tgname = c.relname || '_a_stale_guard' and c.relnamespace = 'public'::regnamespace) = 28, 'stale guard on all synced tables');
-- Nothing anywhere keeps a price on the old columns.
select pg_temp.check(not exists (select 1 from public.device_types where unit_price <> 0 or labor_price <> 0 or billdu_product_id is not null)
                     and not exists (select 1 from public.products where unit_price <> 0 or labor_price <> 0)
                     and not exists (select 1 from public.projects where pricing is not null or billdu_docs <> '[]'::jsonb or billdu_client_id is not null),
                     'old price columns are blank everywhere');

select 'PRICES SYNC TESTS PASSED';
