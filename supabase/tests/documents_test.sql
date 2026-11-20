-- Quotes / invoices checks: run after the migrations (also works inside a transaction that is rolled back).
-- Any failed check raises an exception.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'downer@example.com'),
                                          ('00000000-0000-0000-0000-0000000000d2', 'dtech@example.com'),
                                          ('00000000-0000-0000-0000-0000000000d3', 'doffice@example.com'),
                                          ('00000000-0000-0000-0000-0000000000d4', 'doutsider@example.com'),
                                          ('00000000-0000-0000-0000-0000000000d5', 'dsolo@example.com');

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
  if not coalesce(ok, false) then raise exception 'DOCUMENTS CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
create function pg_temp.error_of(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return '';
exception when others then
  return sqlerrm;
end $$;

-- ---------- number formats (same cases as tests/documents.test.ts) ----------
select pg_temp.check(public.format_document_number('INV-{YYYY}-{0000}', 42, '2026-03-05') = 'INV-2026-0042', 'format: year + padded counter');
select pg_temp.check(public.format_document_number('Q-{0000}', 12345, '2026-11-19') = 'Q-12345', 'format: padding never cuts');
select pg_temp.check(public.format_document_number('{YY}{MM}-{#}', 7, '2026-03-05') = '2603-7', 'format: {YY}{MM} and {#}');
select pg_temp.check(public.format_document_number('EST', 3, '2026-11-19') = 'EST0003', 'format: counter added when missing');
select pg_temp.check(public.format_document_number('', 3, '2026-11-19') = '0003', 'format: empty');
select pg_temp.check(public.format_document_number('{000}/{0}', 5, '2026-11-19') = '005/5', 'format: two counters');

-- ---------- fallback formats when a company saved none (quotes are "Quote", Q-{0000}; never the old EST-) ----------
select pg_temp.check((select fmt from public.document_number_format('00000000-0000-0000-0000-0000000000d5', 'quote')) = 'Q-{0000}', 'quote fallback format is Q-{0000}');
select pg_temp.check((select fmt = 'INV-{YYYY}-{0000}' and yearly from public.document_number_format('00000000-0000-0000-0000-0000000000d5', 'invoice')), 'invoice fallback format is INV-{YYYY}-{0000}, yearly');
select pg_temp.check((select fmt = 'CN-{0000}' and not yearly from public.document_number_format('00000000-0000-0000-0000-0000000000d5', 'credit_note')), 'credit note fallback format is CN-{0000}');
insert into public.document_settings (owner_id, config) values ('00000000-0000-0000-0000-0000000000d5', '{"kinds": {"quote": {"format": "EST-{0000}"}}}');
select pg_temp.check((select fmt from public.document_number_format('00000000-0000-0000-0000-0000000000d5', 'quote')) = 'EST-{0000}', 'a format the company saved itself is kept (even EST-)');
delete from public.document_settings where owner_id = '00000000-0000-0000-0000-0000000000d5';

set role authenticated;

-- ---------- a company: owner, office admin, technician ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
insert into public.projects (id, client_name, address, status) values ('dp1', 'Jane Client', '12 Maple Ridge Rd', 'estimate');
select pg_temp.check(public.create_team('Docs Co', 'Olivia') is not null, 'owner creates a team');
insert into public.team_invites (code, team_id, role, name, email) values ('DOCTECH01', public.my_team_id(), 'tech', 'Tom', null), ('DOCOFFICE1', public.my_team_id(), 'admin', 'Ann', 'doffice@example.com');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select pg_temp.check(public.accept_team_invite('DOCTECH01', '') ->> 'role' = 'tech', 'tech joins');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
select pg_temp.check(public.accept_team_invite('DOCOFFICE1', '') ->> 'role' = 'admin', 'admin joins');

-- ---------- drafts have no number; issuing gives one ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
insert into public.sales_documents (id, project_id, kind, status, number, total, balance_due, valid_until, options, updated_at)
  values ('dq1', 'dp1', 'quote', 'draft', 'HACK-1', 1000, 1000, current_date + 30, '{"requireSignature": true}', '2020-01-01');
select pg_temp.check((select number from public.sales_documents where id = 'dq1') is null, 'a draft has no number (a sent one is ignored)');
select pg_temp.check((select owner_id from public.sales_documents where id = 'dq1') = '00000000-0000-0000-0000-0000000000d1', 'owner_id is the company owner');
update public.sales_documents set status = 'sent', issue_date = '2026-11-19', updated_at = '2020-01-02' where id = 'dq1';
select pg_temp.check((select number from public.sales_documents where id = 'dq1') = 'Q-0001', 'issuing (status sent) numbers it: Q-0001 (the quote fallback, no saved format)');
select pg_temp.check((select updated_at > '2021-01-01' from public.sales_documents where id = 'dq1'), 'numbering bumps updated_at so devices pull it');
update public.sales_documents set number = 'Q-9999', kind = 'invoice' where id = 'dq1';
select pg_temp.check((select number = 'Q-0001' and kind = 'quote' from public.sales_documents where id = 'dq1'), 'number and kind never change once numbered');
update public.sales_documents set number = null, status = 'draft' where id = 'dq1';
select pg_temp.check((select number from public.sales_documents where id = 'dq1') = 'Q-0001', 'a device pushing a stale draft copy keeps the number');

-- The admin issues an invoice offline: it arrives already 'sent' and is numbered on arrival.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
insert into public.sales_documents (id, project_id, kind, status, issue_date, total, balance_due, due_date)
  values ('di1', 'dp1', 'invoice', 'sent', '2026-11-19', 500, 500, current_date - 5);
select pg_temp.check((select number from public.sales_documents where id = 'di1') = 'INV-2026-0001', 'invoice numbered on insert: INV-2026-0001 (yearly)');
insert into public.sales_documents (id, project_id, kind, status, issue_date) values ('di2', 'dp1', 'invoice', 'draft', '2026-11-19');
select pg_temp.check(public.issue_document('di2') = 'INV-2026-0002', 'issue_document numbers a draft: INV-2026-0002');
select pg_temp.check((select status from public.sales_documents where id = 'di2') = 'sent', 'issue_document marks it sent');
select pg_temp.check(public.issue_document('di2') = 'INV-2026-0002', 'issuing again returns the same number');
select pg_temp.check(public.document_numbering() -> 'invoice' ->> 'next' = '3', 'next invoice number is 3');
-- What sync does: upsert the whole row, again and again. No numbers may be burnt.
insert into public.sales_documents (id, project_id, kind, status, issue_date) values ('di2u', 'dp1', 'invoice', 'sent', '2026-11-19')
  on conflict (id) do update set status = excluded.status;
insert into public.sales_documents (id, project_id, kind, status, issue_date) values ('di2u', 'dp1', 'invoice', 'sent', '2026-11-19')
  on conflict (id) do update set status = excluded.status, total = 1;
insert into public.sales_documents (id, project_id, kind, status, issue_date) values ('di2v', 'dp1', 'invoice', 'draft', '2026-11-19');
insert into public.sales_documents (id, project_id, kind, status, issue_date) values ('di2v', 'dp1', 'invoice', 'sent', '2026-11-19')
  on conflict (id) do update set status = excluded.status;
select pg_temp.check((select string_agg(number, ',' order by number) from public.sales_documents where id in ('di2u', 'di2v')) = 'INV-2026-0003,INV-2026-0004', 'upserts (as sync sends them) leave no gaps');
select pg_temp.check(public.document_numbering() -> 'invoice' ->> 'next' = '5', 'next invoice number is 5');

-- Settings: the admin changes the invoice format; the counter for it starts at 1, and numbers already used are skipped.
insert into public.document_settings (owner_id, config) values (public.my_billing_owner(), '{"kinds": {"invoice": {"format": "A-{#}", "yearlyReset": false}}}');
insert into public.sales_documents (id, project_id, kind, status) values ('di3', 'dp1', 'invoice', 'sent');
select pg_temp.check((select number from public.sales_documents where id = 'di3') = 'A-1', 'new format: A-1');
select pg_temp.check(public.set_document_next_number('invoice', 1) -> 'invoice' ->> 'next' = '1', 'admin sets the next number back to 1');
insert into public.sales_documents (id, project_id, kind, status) values ('di4', 'dp1', 'invoice', 'sent');
select pg_temp.check((select number from public.sales_documents where id = 'di4') = 'A-2', 'a used number is skipped: A-2');
select pg_temp.check((select public.set_document_next_number('invoice', 50) -> 'invoice' ->> 'preview') = 'A-50', 'preview of the next number');
select pg_temp.check(pg_temp.fails($$select public.set_document_next_number('invoice', 0)$$), 'next number must be 1 or more');

-- Payments
insert into public.sales_document_payments (id, project_id, document_id, amount, paid_on, method) values ('dpay1', 'dp1', 'di1', 200, current_date, 'check');
select pg_temp.check((select count(*) from public.sales_document_payments where project_id = 'dp1') = 1, 'office records a payment');
select pg_temp.check(pg_temp.fails($$insert into public.sales_document_payments (id, project_id, document_id, amount, method) values ('dpayx', 'dp1', 'di1', 1, 'bitcoin')$$), 'unknown payment method refused');

-- ---------- technicians and outsiders see no money ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select pg_temp.check((select count(*) from public.projects where id = 'dp1') = 1, 'tech sees the job');
select pg_temp.check((select count(*) from public.sales_documents) = 0, 'tech sees no documents');
select pg_temp.check((select count(*) from public.sales_document_payments) = 0, 'tech sees no payments');
select pg_temp.check((select count(*) from public.document_settings) = 0, 'tech sees no invoicing settings');
select pg_temp.check(pg_temp.fails($$insert into public.sales_documents (id, project_id, kind) values ('dtx', 'dp1', 'invoice')$$), 'tech cannot create a document');
select pg_temp.check(pg_temp.fails($$select public.issue_document('di2')$$), 'tech cannot issue');
select pg_temp.check(pg_temp.fails($$select public.take_document_number('dp1', 'invoice', current_date)$$), 'tech cannot take numbers');
select pg_temp.check(pg_temp.fails($$select public.set_document_next_number('invoice', 1)$$), 'tech cannot change numbering');
select pg_temp.check(public.document_numbering() is null, 'tech gets no numbering info');
select pg_temp.check(pg_temp.fails($$select * from public.document_counters$$), 'counters are not readable');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
select pg_temp.check((select count(*) from public.sales_documents) = 0, 'outsider sees no documents');
select pg_temp.check(pg_temp.fails($$select public.issue_document('di2')$$), 'outsider cannot issue');
select pg_temp.check(pg_temp.fails($$select public.take_document_number('dp1', 'invoice', current_date)$$), 'outsider cannot take the company''s numbers');
select pg_temp.check(pg_temp.fails($$insert into public.sales_documents (id, project_id, kind) values ('dox', 'dp1', 'invoice')$$), 'outsider cannot add to the job');
select pg_temp.check((select count(*) from public.document_settings) = 0, 'outsider sees no settings');

-- A solo user has their own counter.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d5');
insert into public.projects (id, client_name, address, status) values ('dp5', 'Solo client', '5 Solo St', 'estimate');
insert into public.sales_documents (id, project_id, kind, status, issue_date) values ('ds1', 'dp5', 'invoice', 'sent', '2026-11-19');
select pg_temp.check((select number from public.sales_documents where id = 'ds1') = 'INV-2026-0001', 'solo user: own sequence');
select pg_temp.check(public.set_document_next_number('quote', 7) -> 'quote' ->> 'next' = '7', 'solo user may set their numbering');

-- ---------- client link: view, accept with signature ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
insert into public.document_links (id, document_id, project_id, snapshot) values ('tok_quote_000000000001', 'dq1', 'dp1', '{"title": "Estimate", "requireSignature": true}');
insert into public.document_links (id, document_id, project_id, snapshot) values ('tok_invoice_0000000001', 'di1', 'dp1', '{"title": "Invoice"}');
select pg_temp.check(pg_temp.fails($$insert into public.document_links (id, document_id, project_id, snapshot) values ('short', 'dq1', 'dp1', '{}')$$), 'tokens are at least 20 characters');
update public.sales_documents set status = 'sent' where id = 'dq1';

select pg_temp.as_anon();
set role anon;
select pg_temp.check(pg_temp.fails($$select count(*) from public.sales_documents$$), 'anon cannot read documents');
select pg_temp.check(pg_temp.fails($$select count(*) from public.document_links$$), 'anon cannot read links');
select pg_temp.check(pg_temp.fails($$select public.issue_document('dq1')$$), 'anon cannot issue');
select pg_temp.check(public.get_document('nope_nope_nope_nope_nope') is null, 'unknown link: nothing');
select pg_temp.check(public.get_document('tok_quote_000000000001') ->> 'status' = 'viewed', 'opening the link marks it viewed');
select pg_temp.check(public.get_document('tok_quote_000000000001') ->> 'number' = 'Q-0001', 'the link shows the number');
select pg_temp.check(position('internal' in public.get_document('tok_quote_000000000001')::text) = 0, 'no internal fields in the public view');
select pg_temp.check(pg_temp.error_of($$select public.respond_document('tok_quote_000000000001', true, 'Jane', null, null)$$) like '%sign%', 'accepting needs a signature');
select pg_temp.check(pg_temp.error_of($$select public.respond_document('tok_invoice_0000000001', true, 'Jane', 'data:image/png;base64,x', null)$$) like '%Only quotes%', 'invoices cannot be accepted');
select pg_temp.check(public.get_document('tok_invoice_0000000001') ->> 'overdue' = 'true', 'an invoice past due with a balance shows overdue');
select pg_temp.check(public.respond_document('tok_quote_000000000001', true, 'Jane Client', 'data:image/png;base64,xyz', 'Looks great') ->> 'status' = 'accepted', 'client accepts with name and signature');
select pg_temp.check(pg_temp.error_of($$select public.respond_document('tok_quote_000000000001', false, 'Jane', null, 'changed my mind')$$) like '%already been answered%', 'answered only once');
set role authenticated;

-- The office sees the answer; a device pushing an older copy can't undo it or forge one.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((select status = 'accepted' and signer_name = 'Jane Client' and signature like 'data:image%' from public.sales_documents where id = 'dq1'), 'answer is on the document');
update public.sales_documents set status = 'sent', signature = null, signer_name = null, responded_at = null, updated_at = now() where id = 'dq1';
select pg_temp.check((select status = 'accepted' and signature is not null and responded_at is not null from public.sales_documents where id = 'dq1'), 'stale push keeps the client''s answer');
insert into public.sales_documents (id, project_id, kind, status, signer_name, signature, responded_at) values ('dq2', 'dp1', 'quote', 'sent', 'Forged', 'data:x', now());
select pg_temp.check((select signature is null and responded_at is null from public.sales_documents where id = 'dq2'), 'the apps cannot write a client signature');
select pg_temp.check((select responded_at is not null and viewed_at is not null from public.document_links where id = 'tok_quote_000000000001'), 'the link records the view and the answer');
update public.document_links set responded_at = null, response_notified_at = now(), view_count = 0 where id = 'tok_quote_000000000001';
select pg_temp.check((select responded_at is not null and response_notified_at is null and view_count > 0 from public.document_links where id = 'tok_quote_000000000001'), 'link stamps are the server''s');

-- Expired quotes can't be accepted; withdrawn links stop working for good.
insert into public.sales_documents (id, project_id, kind, status, valid_until) values ('dq3', 'dp1', 'quote', 'sent', current_date - 1);
insert into public.document_links (id, document_id, project_id, snapshot) values ('tok_expired_0000000001', 'dq3', 'dp1', '{}');
update public.document_links set status = 'revoked' where id = 'tok_invoice_0000000001';
update public.document_links set status = 'active' where id = 'tok_invoice_0000000001';
select pg_temp.check((select status from public.document_links where id = 'tok_invoice_0000000001') = 'revoked', 'a withdrawn link cannot be switched back on');
select pg_temp.as_anon();
set role anon;
select pg_temp.check(public.get_document('tok_expired_0000000001') ->> 'expired' = 'true', 'expired quote says so');
select pg_temp.check(pg_temp.error_of($$select public.respond_document('tok_expired_0000000001', true, 'Jane', 'data:x', null)$$) like '%expired%', 'expired quote cannot be accepted');
select pg_temp.check(public.get_document('tok_invoice_0000000001') is null, 'withdrawn link: nothing');
set role authenticated;

-- Answers are checked (20261124301000_access_guards.sql): the signature must be a PNG data URL; name and note are capped.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
insert into public.sales_documents (id, project_id, kind, status) values ('dq4', 'dp1', 'quote', 'sent');
insert into public.document_links (id, document_id, project_id, snapshot) values ('tok_quote_000000000004', 'dq4', 'dp1', '{"requireSignature": true}');
select pg_temp.as_anon();
set role anon;
select pg_temp.check(pg_temp.error_of($$select public.respond_document('tok_quote_000000000004', true, 'Jane', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', null)$$) like '%PNG%', 'an SVG signature is refused');
select pg_temp.check(pg_temp.error_of($$select public.respond_document('tok_quote_000000000004', true, 'Jane', 'javascript:alert(1)', null)$$) like '%PNG%', 'a non-image signature is refused');
select pg_temp.check(pg_temp.error_of($$select public.respond_document('tok_quote_000000000004', true, 'Jane', 'data:image/png;base64,AAA"><script>', null)$$) like '%PNG%', 'a signature with markup after the data is refused');
select pg_temp.check(public.respond_document('tok_quote_000000000004', true, repeat('N', 300), 'data:image/png;base64,iVBORw0KGgo=', repeat('x', 5000)) ->> 'status' = 'accepted', 'a PNG signature is accepted');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check((select length(signer_name) = 120 and length(client_note) = 4000 from public.sales_documents where id = 'dq4'), 'the signer''s name and note are capped');

-- ---------- tech still can't see links ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select pg_temp.check((select count(*) from public.document_links) = 0, 'tech sees no client links');

-- ---------- lapsed subscription: read-only ----------
reset role;
update public.teams set plan_status = 'canceled', trial_ends_at = now() - interval '1 minute' where owner_id = '00000000-0000-0000-0000-0000000000d1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
select pg_temp.check(pg_temp.error_of($$insert into public.sales_documents (id, project_id, kind) values ('dlock', 'dp1', 'invoice')$$) like '%subscription inactive%', 'locked company cannot add documents');
select pg_temp.check(pg_temp.error_of($$insert into public.sales_document_payments (id, project_id, document_id, amount) values ('dplock', 'dp1', 'di1', 5)$$) like '%subscription inactive%', 'locked company cannot add payments');
insert into public.sales_documents (id, project_id, kind, status) select 'x', 'dp1', 'quote', 'draft' where false;
select pg_temp.check((select count(*) from public.sales_documents where project_id = 'dp1') >= 5, 'locked company still reads its documents');
select pg_temp.check(pg_temp.error_of($$insert into public.document_settings (owner_id, config) values ('00000000-0000-0000-0000-0000000000d1', '{}')
  on conflict (owner_id) do update set config = excluded.config$$) like '%subscription inactive%', 'locked company cannot change its document settings');
reset role;
update public.teams set plan_status = 'active' where owner_id = '00000000-0000-0000-0000-0000000000d1';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check(public.issue_document('dq2') is not null, 'active again: issuing works');

reset role;
select 'DOCUMENTS TESTS PASSED';
