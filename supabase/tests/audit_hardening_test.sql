-- Audit hardening checks (20261126001000_audit_hardening.sql): run after the migrations. Any failed check raises an
-- exception.
\set ON_ERROR_STOP on
update public.billing_settings set enforce = true;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000a0d1', 'aowner@example.com'),
                                          ('00000000-0000-0000-0000-00000000a0d2', 'aother@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '{"role": "anon"}', false);
  perform set_config('request.jwt.claim.role', 'anon', false);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'AUDIT HARDENING CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.error_of(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated, service_role;
grant execute on function pg_temp.error_of(text) to anon, authenticated, service_role;

select pg_temp.check(public.schema_version() >= '20261126001000_audit_hardening', 'schema_version reports the audit hardening migration');

-- ---------- 1. a lapsed company can't change its prices ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000a0d1');
select pg_temp.check(public.create_team('Audit Co', 'Ann') is not null, 'owner creates a team');
insert into public.projects (id, client_name, address, status) values ('ap1', 'Sample Client', '1 Audit St', 'estimate');
insert into public.device_types (id, name, category) values ('acam', 'Camera', 'security');
insert into public.products (id, device_type_id, brand, model) values ('aprod', 'acam', 'B', 'M');
select pg_temp.check(pg_temp.error_of($$insert into public.device_type_prices (owner_id, device_type_id, unit_price) values (public.my_billing_owner(), 'acam', 100)$$) = '',
  'active: device type price goes in');
select pg_temp.check(pg_temp.error_of($$insert into public.product_prices (owner_id, product_id, unit_price) values (public.my_billing_owner(), 'aprod', 50)$$) = '',
  'active: product price goes in');

reset role;
update public.teams set plan_status = 'canceled', trial_ends_at = now() - interval '1 day' where owner_id = '00000000-0000-0000-0000-00000000a0d1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000a0d1');
select pg_temp.check(pg_temp.error_of($$update public.device_type_prices set unit_price = 1, updated_at = now() where device_type_id = 'acam'$$) = 'PinPlan subscription inactive',
  'lapsed: device type price change refused');
select pg_temp.check(pg_temp.error_of($$insert into public.device_type_prices (owner_id, device_type_id, unit_price) values (public.my_billing_owner(), 'acam2', 1)$$) = 'PinPlan subscription inactive',
  'lapsed: new device type price refused');
select pg_temp.check(pg_temp.error_of($$update public.product_prices set unit_price = 1, updated_at = now() where product_id = 'aprod'$$) = 'PinPlan subscription inactive',
  'lapsed: product price change refused');
select pg_temp.check(pg_temp.error_of($$delete from public.product_prices where product_id = 'aprod'$$) = 'PinPlan subscription inactive',
  'lapsed: product price delete refused');
select pg_temp.check((select unit_price from public.device_type_prices where device_type_id = 'acam') = 100, 'lapsed: prices are still readable and unchanged');

reset role;
select pg_temp.check((select count(*) from pg_trigger where tgname in ('device_type_prices_company_write_guard', 'product_prices_company_write_guard')
                       and tgfoid = 'public.company_write_guard()'::regprocedure and tgtype = (select tgtype from pg_trigger where tgname = 'device_types_company_write_guard')) = 2,
  'price tables use the same guard trigger as the catalog (same timing and events)');
update public.teams set plan_status = 'active' where owner_id = '00000000-0000-0000-0000-00000000a0d1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000a0d1');
select pg_temp.check(pg_temp.error_of($$update public.device_type_prices set unit_price = 120, updated_at = now() where device_type_id = 'acam'$$) = '',
  'active again: price change goes in');
select pg_temp.check((select unit_price from public.device_type_prices where device_type_id = 'acam') = 120, 'active again: price saved');

-- ---------- 2. respond_proposal keeps only real optional lines ----------
insert into public.proposals (id, project_id, snapshot, valid_until) values
  ('atok_prop_opts_0000000001', 'ap1', '{"taxPct": 0, "lines": [
     {"key": "dev:cam", "total": 100},
     {"key": "opt:led", "total": 10, "optional": true},
     {"key": "opt:sign", "total": 5, "optional": true}]}', current_date + 10),
  ('atok_prop_many_0000000001', 'ap1', '{"taxPct": 0, "lines": []}', current_date + 10);
reset role;
-- (the snapshot is the database's: written here as the server would)
update public.proposals set snapshot = jsonb_set(snapshot, '{lines}',
  (select jsonb_agg(jsonb_build_object('key', 'opt:' || i, 'total', 1, 'optional', true)) from generate_series(1, 600) i))
  where id = 'atok_prop_many_0000000001';
set role anon;
select pg_temp.as_anon();
select public.respond_proposal('atok_prop_opts_0000000001', true, 'Jane', 'data:image/png;base64,AAAA',
  '["opt:sign", "opt:led", "opt:led", "dev:cam", "made-up", 7, {"k": 1}, null, "opt:sign"]', null);
reset role;
select pg_temp.check((select chosen_options from public.proposals where id = 'atok_prop_opts_0000000001') = '["opt:sign", "opt:led"]'::jsonb,
  'chosen options: only optional lines of this proposal, each once, in the client''s order');
select pg_temp.check((select accepted_total from public.proposals where id = 'atok_prop_opts_0000000001') = 115, 'accepted total counts the kept options once');
set role anon;
select pg_temp.as_anon();
select public.respond_proposal('atok_prop_many_0000000001', true, 'Jane', 'data:image/png;base64,AAAA',
  (select jsonb_agg('opt:' || i) from generate_series(1, 700) i), null);
reset role;
select pg_temp.check((select jsonb_array_length(chosen_options) from public.proposals where id = 'atok_prop_many_0000000001') = 500, 'at most 500 options are kept');
select pg_temp.check((select chosen_options -> 0 = '"opt:1"' and chosen_options -> 499 = '"opt:500"' from public.proposals where id = 'atok_prop_many_0000000001'),
  'the first 500 picks are the ones kept');

-- ---------- 3. change order and RFI links expire ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000a0d1');
insert into public.change_orders (id, project_id, number, title, status) values ('aco1', 'ap1', 1, 'Extra camera', 'draft');
select pg_temp.check((select share_expires_at is null from public.change_orders where id = 'aco1'), 'a change order without a link has no expiry');
update public.change_orders set status = 'sent', share_token = 'atok_co_aaaaaaaaaaaaaaaaaaaa', sent_at = now(), public_view = '{}', updated_at = now() + interval '1 second',
  share_expires_at = now() + interval '50 years' where id = 'aco1';
select pg_temp.check((select share_expires_at between now() + interval '364 days' and now() + interval '366 days' from public.change_orders where id = 'aco1'),
  'sending a change order link starts a year (the app can''t choose the expiry)');
update public.change_orders set share_expires_at = now() + interval '50 years', updated_at = now() + interval '2 seconds' where id = 'aco1';
select pg_temp.check((select share_expires_at < now() + interval '366 days' from public.change_orders where id = 'aco1'), 'an app can''t extend the link');
update public.change_orders set share_expires_at = null, updated_at = now() + interval '3 seconds' where id = 'aco1';
select pg_temp.check((select share_expires_at > now() + interval '364 days' from public.change_orders where id = 'aco1'), 'an app can''t clear the expiry');
insert into public.rfis (id, project_id, number, subject, status, share_token, sent_at) values ('arfi1', 'ap1', 1, 'Mount height?', 'open', 'atok_rfi_aaaaaaaaaaaaaaaaaaa', now());
select pg_temp.check((select share_expires_at between now() + interval '364 days' and now() + interval '366 days' from public.rfis where id = 'arfi1'),
  'an RFI shared on insert (another device) gets a year');
-- A stale copy that drops the token: rfis_keep_answer puts it back, and the expiry stays.
update public.rfis set share_token = null, sent_at = null, updated_at = now() + interval '1 second' where id = 'arfi1';
select pg_temp.check((select share_token = 'atok_rfi_aaaaaaaaaaaaaaaaaaa' and share_expires_at > now() + interval '364 days' from public.rfis where id = 'arfi1'),
  'a stale copy without the link keeps the link and its expiry');

-- The server can set it (e.g. to expire a link); a later re-send starts a new year.
reset role;
select pg_temp.as_service();
set role service_role;
update public.rfis set share_expires_at = now() - interval '1 minute' where id = 'arfi1';
reset role;
select pg_temp.check((select share_expires_at < now() from public.rfis where id = 'arfi1'), 'the server can set the expiry');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000a0d1');
update public.rfis set subject = 'Mount height? (edited)', updated_at = now() + interval '2 seconds' where id = 'arfi1';
select pg_temp.check((select share_expires_at < now() from public.rfis where id = 'arfi1'), 'an ordinary edit doesn''t revive an expired link');
-- The apps' real write: a whole-row upsert (insert … on conflict do update) with the same token and sent_at.
insert into public.rfis (id, project_id, number, subject, status, share_token, sent_at, updated_at)
  select id, project_id, number, 'Mount height? (synced)', status, share_token, sent_at, now() + interval '2500 milliseconds' from public.rfis where id = 'arfi1'
  on conflict (id) do update set subject = excluded.subject, share_token = excluded.share_token, sent_at = excluded.sent_at, updated_at = excluded.updated_at;
select pg_temp.check((select subject = 'Mount height? (synced)' and share_expires_at < now() from public.rfis where id = 'arfi1'), 'a sync upsert of the same link doesn''t revive it');
update public.rfis set sent_at = now() + interval '1 second', updated_at = now() + interval '3 seconds' where id = 'arfi1';
select pg_temp.check((select share_expires_at > now() + interval '364 days' from public.rfis where id = 'arfi1'), 'sending it again starts a new year');
reset role;

-- The backfill (run again here on rows without an expiry, as the migration does): generous, never shorter than a year.
alter table public.change_orders disable trigger change_orders_share_expiry;
insert into public.change_orders (id, project_id, number, title, status, share_token, sent_at, public_view)
  values ('aco_old', 'ap1', 2, 'Old', 'sent', 'atok_co_old_aaaaaaaaaaaaaaaa', now() - interval '3 years', '{}'),
         ('aco_recent', 'ap1', 3, 'Recent', 'sent', 'atok_co_recent_aaaaaaaaaaaaa', now() - interval '11 months', '{}');
alter table public.change_orders enable trigger change_orders_share_expiry;
update public.change_orders set share_expires_at = greatest(now(), coalesce(sent_at, updated_at, created_at, now())) + interval '1 year'
  where share_token is not null and share_expires_at is null;
select pg_temp.check((select bool_and(share_expires_at >= now() + interval '364 days') from public.change_orders where id in ('aco_old', 'aco_recent')),
  'backfilled links get at least a year from now');

select pg_temp.check((select count(*) from pg_trigger where tgname in ('change_orders_share_expiry', 'rfis_share_expiry')) = 2, 'expiry triggers installed');
select pg_temp.check('change_orders_share_expiry' > 'change_orders_guard' and 'rfis_share_expiry' > 'rfis_keep_answer', 'expiry runs after the stale-copy guards');

-- ---------- 4. company preferences: no future-dated sections ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000a0d1');
insert into public.company_settings (owner_id, business_name, preferences) values (public.my_billing_owner(), 'Audit Co',
  '{"branding": {"value": {"tagline": "Future"}, "updatedAt": "2099-01-01T00:00:00.000Z"},
    "takeoff": {"value": {"slack": 1}, "updatedAt": "infinity"},
    "trades": {"value": ["x"], "updatedAt": null},
    "formTemplates": {"value": [], "updatedAt": "2026-11-01T00:00:00.000Z"}}');
select pg_temp.check((select (preferences -> 'branding' ->> 'updatedAt')::timestamptz between now() - interval '1 minute' and now() + interval '1 minute' from public.company_settings),
  'a section dated far ahead is dated now');
select pg_temp.check((select preferences -> 'branding' ->> 'updatedAt' ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$' from public.company_settings), 'the new time is ISO text');
select pg_temp.check((select preferences -> 'branding' -> 'value' ->> 'tagline' = 'Future' from public.company_settings), 'its value is kept');
select pg_temp.check((select not (preferences ? 'takeoff') and not (preferences ? 'trades') from public.company_settings), 'sections dated infinity or null are ignored');
select pg_temp.check((select preferences ? 'formTemplates' from public.company_settings), 'ordinary sections still go in');
update public.company_settings set preferences = jsonb_build_object('branding', jsonb_build_object('value', '{"tagline": "Now"}'::jsonb,
  'updatedAt', to_char((now() + interval '1 second') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
select pg_temp.check((select preferences -> 'branding' -> 'value' ->> 'tagline' = 'Now' from public.company_settings), 'a later real edit replaces the clamped section');
reset role;
-- A section stored with a far-future time before this migration doesn't lock it.
select pg_temp.check(public.merge_preferences('{"branding": {"value": 1, "updatedAt": "2099-01-01T00:00:00.000Z"}}',
  '{"branding": {"value": 2, "updatedAt": "2026-01-01T00:00:00.000Z"}}') -> 'branding' -> 'value' = '2', 'a stored future-dated section is replaced by a real one');
select pg_temp.check(public.merge_preferences('{"branding": {"value": 1, "updatedAt": "2026-06-01T00:00:00.000Z"}}',
  '{"branding": {"value": 2, "updatedAt": "2026-01-01T00:00:00.000Z"}}') -> 'branding' -> 'value' = '1', 'an older section still loses');
select pg_temp.check(public.merge_preferences('{}', '{"branding": {"value": 2, "updatedAt": "-infinity"}}') = '{}', '-infinity is ignored too');

-- ---------- 5. Billdu send claims ----------
select pg_temp.check((select relrowsecurity from pg_class where oid = 'public.billdu_send_claims'::regclass), 'RLS is on (billdu_send_claims)');
select pg_temp.check(not exists (select 1 from pg_policies where tablename = 'billdu_send_claims'), 'no policies on billdu_send_claims');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000a0d1');
select pg_temp.check(pg_temp.error_of($$select * from public.billdu_send_claims$$) like '%permission denied%', 'signed-in users can''t read claims');
select pg_temp.check(pg_temp.error_of($$select public.billdu_send_claim('00000000-0000-0000-0000-00000000a0d1', 'ap1', 'estimate')$$) like '%permission denied%',
  'signed-in users can''t take a claim');
reset role;
set role anon;
select pg_temp.as_anon();
select pg_temp.check(pg_temp.error_of($$insert into public.billdu_send_claims (owner_id, project_id, doc_type) values ('00000000-0000-0000-0000-00000000a0d1', 'ap1', 'estimate')$$) like '%permission denied%',
  'anon can''t write claims');
reset role;

select pg_temp.as_service();
set role service_role;
select pg_temp.check((public.billdu_send_claim('00000000-0000-0000-0000-00000000a0d1', 'ap1', 'estimate') ->> 'ok')::boolean, 'first send takes the claim');
select pg_temp.check(not (public.billdu_send_claim('00000000-0000-0000-0000-00000000a0d1', 'ap1', 'estimate') ->> 'ok')::boolean, 'a second send while the first runs is refused');
select pg_temp.check((public.billdu_send_claim('00000000-0000-0000-0000-00000000a0d1', 'ap1', 'invoice') ->> 'ok')::boolean, 'another document type has its own claim');
update public.billdu_send_claims set billdu_doc_id = 4711 where project_id = 'ap1' and doc_type = 'estimate';
select pg_temp.check(public.billdu_send_claim('00000000-0000-0000-0000-00000000a0d1', 'ap1', 'estimate') - 'started_at' = '{"ok": true, "billdu_doc_id": 4711}',
  'once the document exists, a resend may go ahead and gets its id');
update public.billdu_send_claims set started_at = now() - interval '3 minutes' where project_id = 'ap1' and doc_type = 'invoice';
select pg_temp.check((public.billdu_send_claim('00000000-0000-0000-0000-00000000a0d1', 'ap1', 'invoice') ->> 'ok')::boolean, 'a claim older than 2 minutes (a send that died) is taken over');
select pg_temp.check(pg_temp.error_of($$select public.billdu_send_claim('00000000-0000-0000-0000-00000000a0d1', 'ap1', 'credit')$$) <> '', 'unknown document types are refused');
select pg_temp.check((public.billdu_send_claim('00000000-0000-0000-0000-00000000a0d1', 'ap1', 'invoice_deposit') ->> 'ok')::boolean, 'a deposit document has its own claim');
select pg_temp.check(not (public.billdu_send_claim('00000000-0000-0000-0000-00000000a0d1', 'ap1', 'invoice_deposit') ->> 'ok')::boolean, 'two deposit sends at once: the second is refused');
delete from public.billdu_send_claims where project_id = 'ap1' and doc_type = 'invoice' and billdu_doc_id is null;
select pg_temp.check((public.billdu_send_claim('00000000-0000-0000-0000-00000000a0d1', 'ap1', 'invoice') ->> 'ok')::boolean, 'a released claim can be taken again');
-- The server lets go of its own claim by the started_at the claim returned (as the route does through the REST API).
create temp table claim_taken as select public.billdu_send_claim('00000000-0000-0000-0000-00000000a0d1', 'ap1', 'order') as c;
delete from public.billdu_send_claims where project_id = 'ap1' and doc_type = 'order' and billdu_doc_id is null
  and started_at = ((select c from claim_taken) ->> 'started_at')::timestamptz;
select pg_temp.check(not exists (select 1 from public.billdu_send_claims where project_id = 'ap1' and doc_type = 'order'), 'the returned started_at finds the claim again (release works)');
reset role;

update public.billing_settings set enforce = false;
