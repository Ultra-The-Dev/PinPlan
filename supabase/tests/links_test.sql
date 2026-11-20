-- Client link expiry checks (20261124300500_link_expiry.sql): run after the migrations.
-- Any failed check raises an exception.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000071e1', 'lowner@example.com');

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
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'LINKS CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.error_of(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;
grant execute on function pg_temp.check(boolean, text) to anon, authenticated;
grant execute on function pg_temp.error_of(text) to anon, authenticated;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000071e1');
insert into public.projects (id, client_name, address, status) values ('lp1', 'Sample Client', '1 Test St', 'estimate');

-- ---------- proposals ----------
insert into public.proposals (id, project_id, snapshot, valid_until) values
  ('ltok_prop_live_00000000001', 'lp1', '{"business": {"name": "Sample Electric"}, "client": {"name": "Jane"}, "lines": []}', current_date + 10),
  ('ltok_prop_late_00000000001', 'lp1', '{"business": {"name": "Sample Electric"}, "client": {"name": "Jane"}, "lines": []}', current_date - 5),
  ('ltok_prop_gone_00000000001', 'lp1', '{"business": {"name": "Sample Electric"}, "client": {"name": "Jane Secret"}, "lines": [{"key": "dev:cam", "total": 1234}]}', current_date - 31),
  ('ltok_prop_none_00000000001', 'lp1', '{"business": {"name": "Sample Electric"}, "lines": []}', null);

-- ---------- photo reports ----------
insert into public.photo_reports (id, project_id, snapshot) values ('ltok_rep_default_000000001', 'lp1', '{"title": "Pre-wire"}');
insert into public.photo_reports (id, project_id, snapshot, expires_at) values ('ltok_rep_expired_000000001', 'lp1', '{"title": "Old"}', now() - interval '1 minute');
insert into public.photo_reports (id, project_id, snapshot, expires_at) values ('ltok_rep_forever_000000001', 'lp1', '{"title": "Kept"}', null);
select pg_temp.check((select expires_at between now() + interval '364 days' and now() + interval '366 days' from public.photo_reports where id = 'ltok_rep_default_000000001'),
  'a new photo report link expires after a year by default');

-- ---------- quote links ----------
insert into public.sales_documents (id, project_id, kind, status, total, balance_due) values ('lq1', 'lp1', 'quote', 'sent', 100, 100),
                                                                                             ('lq2', 'lp1', 'quote', 'sent', 100, 100);
insert into public.document_links (id, document_id, project_id, snapshot, expires_at) values
  ('ltok_doc_live_000000000001', 'lq1', 'lp1', '{"title": "Quote", "requireSignature": false}', now() + interval '1 day'),
  ('ltok_doc_gone_000000000001', 'lq2', 'lp1', '{"title": "Quote", "requireSignature": false}', now() - interval '1 minute'),
  ('ltok_doc_none_000000000001', 'lq2', 'lp1', '{"title": "Quote", "requireSignature": false}', null);
select pg_temp.check((select expires_at is null from public.document_links where id = 'ltok_doc_none_000000000001'), 'quote / invoice links have no end date unless one is set');

-- ---------- the client side (no account) ----------
reset role;
set role anon;
select pg_temp.as_anon();

select pg_temp.check(public.get_proposal('ltok_prop_live_00000000001') -> 'snapshot' -> 'client' ->> 'name' = 'Jane', 'a live proposal opens in full');
select pg_temp.check((select (p ->> 'expired')::boolean and p ? 'snapshot' from (select public.get_proposal('ltok_prop_late_00000000001') p) x),
  'just past its date a proposal still opens (marked expired)');
select pg_temp.check((select p ->> 'status' = 'expired' and (p ->> 'expired')::boolean and not p ? 'snapshot' and p -> 'business' ->> 'name' = 'Sample Electric'
                      from (select public.get_proposal('ltok_prop_gone_00000000001') p) x),
  'a month past its date a proposal returns only "expired" and the business name');
select pg_temp.check(position('Jane Secret' in public.get_proposal('ltok_prop_gone_00000000001')::text) = 0
                     and position('1234' in public.get_proposal('ltok_prop_gone_00000000001')::text) = 0,
  'no client details or prices after the grace period');
select pg_temp.check(public.get_proposal('ltok_prop_none_00000000001') ? 'snapshot', 'a proposal with no valid-until date keeps opening');
select pg_temp.check(pg_temp.error_of($$select public.respond_proposal('ltok_prop_gone_00000000001', true, 'Jane', 'data:image/png;base64,AAAA', '[]', null)$$) like '%expired%',
  'an expired proposal cannot be accepted');

select pg_temp.check(public.get_photo_report('ltok_rep_default_000000001') -> 'snapshot' ->> 'title' = 'Pre-wire', 'a photo report opens before it expires');
select pg_temp.check(public.get_photo_report('ltok_rep_expired_000000001') is null, 'an expired photo report returns nothing');
select pg_temp.check(public.get_photo_report('ltok_rep_forever_000000001') is not null, 'a photo report with no end date keeps opening');

select pg_temp.check(public.get_document('ltok_doc_live_000000000001') -> 'snapshot' ->> 'title' = 'Quote', 'a quote link opens before it expires');
select pg_temp.check(public.get_document('ltok_doc_gone_000000000001') is null, 'an expired quote link returns nothing');
select pg_temp.check(public.get_document('ltok_doc_none_000000000001') is not null, 'a quote link with no end date keeps opening');
select pg_temp.check(pg_temp.error_of($$select public.respond_document('ltok_doc_gone_000000000001', true, 'Jane', null, null)$$) like '%expired%',
  'an expired quote link cannot be answered');
reset role;
select pg_temp.check((select status = 'viewed' and responded_at is null from public.sales_documents where id = 'lq2'), 'the refused answer left the quote untouched');
set role anon;
select pg_temp.as_anon();
select pg_temp.check(public.respond_document('ltok_doc_live_000000000001', true, 'Jane', null, null) ->> 'status' = 'accepted', 'a live quote link can be answered');

-- ---------- the office can still move or clear the end date ----------
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000071e1');
update public.photo_reports set expires_at = now() + interval '1 day' where id = 'ltok_rep_expired_000000001';
select pg_temp.check(public.get_photo_report('ltok_rep_expired_000000001') is not null, 'extending a photo report link reopens it');

reset role;
select 'LINKS TESTS PASSED';
