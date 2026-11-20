-- Money integrity (20261124300400_money_integrity.sql): invoice balances worked out by the database, per-job numbers
-- for change orders / RFIs / tasks, and the OAuth cookie hash column. Run after the migrations from the repo root
-- (scripts/test-supabase.sh). Any failed check raises an exception.
\set ON_ERROR_STOP on
\set cases `cat tests/fixtures/paymentSummaryCases.json`
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000004a1', 'mowner@example.com'),
                                          ('00000000-0000-0000-0000-0000000004a2', 'mtech@example.com'),
                                          ('00000000-0000-0000-0000-0000000004a3', 'moffice@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'MONEY INTEGRITY CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
grant execute on function pg_temp.check(boolean, text), pg_temp.fails(text), pg_temp.as_user(text) to anon, authenticated, service_role;

-- ---------- paymentSummary parity: the same cases as tests/documents.test.ts ----------
create temp table parity as
  select c ->> 'name' as name, c -> 'expect' as want, s.*
  from jsonb_array_elements(:'cases'::jsonb) c,
       lateral public.payment_summary((c ->> 'total')::double precision, c -> 'payments', c -> 'credits') s;
select pg_temp.check((select count(*) from parity) >= 10, 'parity cases loaded');
select pg_temp.check(paid = (want ->> 'paid')::numeric and credited = (want ->> 'credited')::numeric and balance = (want ->> 'balance')::numeric
                     and paid_on is not distinct from (want ->> 'paidOn')::date, 'parity: ' || name)
  from parity order by name;

-- ---------- a company with a job ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000004a1');
insert into public.projects (id, client_name, address, status) values ('mp1', 'Sample Client', '1 Example St', 'estimate');
select pg_temp.check(public.create_team('Money Co', 'Olivia') is not null, 'owner creates a team');
insert into public.team_invites (code, team_id, role, name) values ('MONTECH01', public.my_team_id(), 'tech', 'Tom'), ('MONOFFICE1', public.my_team_id(), 'admin', 'Ann');
select pg_temp.as_user('00000000-0000-0000-0000-0000000004a2');
select pg_temp.check(public.accept_team_invite('MONTECH01', '') ->> 'role' = 'tech', 'tech joins');
select pg_temp.as_user('00000000-0000-0000-0000-0000000004a3');
select pg_temp.check(public.accept_team_invite('MONOFFICE1', '') ->> 'role' = 'admin', 'admin joins');

-- ---------- invoice balance: the database decides ----------
insert into public.sales_documents (id, project_id, kind, status, issue_date, total, amount_paid, balance_due, updated_at)
  values ('mi1', 'mp1', 'invoice', 'sent', '2026-11-19', 1000, 0, 1000, '2026-11-19T10:00:00Z');
select pg_temp.check((select balance_due = 1000 and status = 'sent' from public.sales_documents where id = 'mi1'), 'a new invoice owes its total');

-- Device A records 400 (and saves the invoice with its own sums).
insert into public.sales_document_payments (id, project_id, document_id, amount, paid_on, method) values ('mpa', 'mp1', 'mi1', 400, '2026-11-20', 'check');
select pg_temp.check((select amount_paid = 400 and balance_due = 600 and status = 'partially_paid' from public.sales_documents where id = 'mi1'), 'a payment updates the invoice');
-- Device B (offline, never saw A's payment) records 600 and pushes its copy of the invoice saying 600 paid, 400 due.
insert into public.sales_document_payments (id, project_id, document_id, amount, paid_on, method) values ('mpb', 'mp1', 'mi1', 600, '2026-11-21', 'card');
update public.sales_documents set amount_paid = 600, balance_due = 400, status = 'partially_paid', paid_at = null, updated_at = '2026-11-19T11:00:00Z' where id = 'mi1';
select pg_temp.check((select amount_paid = 1000 and balance_due = 0 and status = 'paid' and paid_at = '2026-11-21' from public.sales_documents where id = 'mi1'),
  'the last device to save does not decide the balance: both payments count, paid on the day it was settled');
select pg_temp.check((select updated_at > '2026-11-19T11:00:00Z' from public.sales_documents where id = 'mi1'), 'a corrected invoice is stamped newer so devices pull it');
-- A stale copy claiming nothing was paid.
update public.sales_documents set amount_paid = 0, balance_due = 1000, status = 'sent' where id = 'mi1';
select pg_temp.check((select status = 'paid' and balance_due = 0 from public.sales_documents where id = 'mi1'), 'a stale "sent" copy does not reopen a paid invoice');
-- Voiding a payment and deleting one.
update public.sales_document_payments set voided = true where id = 'mpb';
select pg_temp.check((select amount_paid = 400 and balance_due = 600 and status = 'partially_paid' and paid_at is null from public.sales_documents where id = 'mi1'), 'voiding a payment reopens the balance');
update public.sales_document_payments set deleted = true where id = 'mpa';
select pg_temp.check((select amount_paid = 0 and balance_due = 1000 and status = 'sent' from public.sales_documents where id = 'mi1'), 'with nothing paid it goes back to sent');
update public.sales_documents set viewed_at = now() where id = 'mi1';
select pg_temp.check((select status = 'viewed' from public.sales_documents where id = 'mi1'), '... or viewed once the client opened it');

-- Credit notes count once issued.
insert into public.sales_documents (id, project_id, kind, status, total, converted_from) values ('mcn1', 'mp1', 'credit_note', 'draft', 250, 'mi1');
select pg_temp.check((select balance_due = 1000 from public.sales_documents where id = 'mi1'), 'a draft credit note does not count');
update public.sales_documents set status = 'sent' where id = 'mcn1';
select pg_temp.check((select amount_paid = 250 and balance_due = 750 and status = 'partially_paid' from public.sales_documents where id = 'mi1'), 'an issued credit note lowers the balance');
update public.sales_documents set total = 1000 where id = 'mcn1';
select pg_temp.check((select balance_due = 0 and status = 'paid' and paid_at is null from public.sales_documents where id = 'mi1'), 'credited in full: paid, with no payment day');
update public.sales_documents set status = 'void' where id = 'mcn1';
select pg_temp.check((select balance_due = 1000 and status = 'viewed' from public.sales_documents where id = 'mi1'), 'a void credit note no longer counts');

-- Drafts and void invoices keep their status.
insert into public.sales_documents (id, project_id, kind, status, total, balance_due) values ('mi2', 'mp1', 'invoice', 'draft', 300, 300);
insert into public.sales_document_payments (id, project_id, document_id, amount, paid_on) values ('mpc', 'mp1', 'mi2', 300, '2026-11-22');
select pg_temp.check((select status = 'draft' and amount_paid = 300 and balance_due = 0 from public.sales_documents where id = 'mi2'), 'a draft stays a draft (its sums still follow)');
insert into public.sales_documents (id, project_id, kind, status, issue_date, total, balance_due) values ('mi3', 'mp1', 'invoice', 'sent', '2026-11-19', 80, 80);
update public.sales_documents set status = 'void' where id = 'mi3';
insert into public.sales_document_payments (id, project_id, document_id, amount, paid_on) values ('mpd', 'mp1', 'mi3', 80, '2026-11-22');
select pg_temp.check((select status = 'void' from public.sales_documents where id = 'mi3'), 'a void invoice stays void');
-- Quotes are left alone.
insert into public.sales_documents (id, project_id, kind, status, total, balance_due) values ('mq1', 'mp1', 'quote', 'draft', 90, 90);
select pg_temp.check((select balance_due = 90 and amount_paid = 0 from public.sales_documents where id = 'mq1'), 'quotes are not touched');

-- ---------- per-job numbers ----------
-- Two devices create CO-001 offline; the second to arrive gets the next number.
insert into public.change_orders (id, project_id, number, title, status, updated_at) values ('mco1', 'mp1', 1, 'Extra camera', 'draft', '2026-11-19T10:00:00Z');
insert into public.change_orders (id, project_id, number, title, status, updated_at) values ('mco2', 'mp1', 1, 'Move a reader', 'draft', '2026-11-19T10:00:00Z');
select pg_temp.check((select number from public.change_orders where id = 'mco2') = 2, 'a duplicate change order number is replaced by the next one');
select pg_temp.check((select updated_at > '2026-11-19T10:00:00Z' from public.change_orders where id = 'mco2'), 'a renumbered row is stamped newer');
select pg_temp.check((select number from public.change_orders where id = 'mco1') = 1, 'the first keeps its number');
insert into public.change_orders (id, project_id, title, status) values ('mco3', 'mp1', 'No number', 'draft');
select pg_temp.check((select number from public.change_orders where id = 'mco3') = 3, 'number 0 (or none) gets the next one');
-- Sync re-sends rows as upserts: nothing moves.
insert into public.change_orders (id, project_id, number, title, status) values ('mco2', 'mp1', 2, 'Move a reader', 'draft')
  on conflict (id) do update set number = excluded.number, title = excluded.title;
select pg_temp.check((select number from public.change_orders where id = 'mco2') = 2, 'an upsert of an existing row keeps its number');
-- Deleted numbers are never handed out again.
update public.change_orders set deleted = true where id = 'mco3';
insert into public.change_orders (id, project_id, number, title, status) values ('mco4', 'mp1', 3, 'Reuses 3', 'draft');
select pg_temp.check((select number from public.change_orders where id = 'mco4') = 4, 'a deleted change order''s number is not reused');
-- A revision keeps its number while the original is void.
update public.change_orders set status = 'sent' where id = 'mco1';
update public.change_orders set status = 'void' where id = 'mco1';
insert into public.change_orders (id, project_id, number, title, status) values ('mco1r', 'mp1', 1, 'Extra camera (rev 1)', 'draft');
select pg_temp.check((select number from public.change_orders where id = 'mco1r') = 1, 'a revision keeps the void original''s number');
insert into public.change_orders (id, project_id, number, title, status) values ('mco1s', 'mp1', 1, 'Extra camera (rev 1)', 'draft');
select pg_temp.check((select number from public.change_orders where id = 'mco1s') = 5, 'but not twice');
-- Changing a number to one that is taken moves it to the next free one.
update public.change_orders set number = 2 where id = 'mco4';
select pg_temp.check((select number from public.change_orders where id = 'mco4') = 6, 'a device cannot move a row onto a taken number');

-- RFIs and tasks (technicians create tasks too).
insert into public.rfis (id, project_id, number, subject, status) values ('mr1', 'mp1', 1, 'Mount height?', 'draft');
insert into public.rfis (id, project_id, number, subject, status) values ('mr2', 'mp1', 1, 'Ceiling type?', 'draft');
select pg_temp.check((select number from public.rfis where id = 'mr2') = 2, 'duplicate RFI number replaced');
update public.rfis set deleted = true where id = 'mr2';
insert into public.rfis (id, project_id, number, subject, status) values ('mr3', 'mp1', 2, 'Door hardware?', 'draft');
select pg_temp.check((select number from public.rfis where id = 'mr3') = 3, 'a deleted RFI''s number is not reused');
select pg_temp.as_user('00000000-0000-0000-0000-0000000004a2');
insert into public.tasks (id, project_id, number, title, status) values ('mt1', 'mp1', 1, 'Mount camera', 'open');
insert into public.tasks (id, project_id, number, title, status) values ('mt2', 'mp1', 1, 'Pull cable', 'open');
insert into public.tasks (id, project_id, number, title, status) values ('mt3', 'mp1', 0, 'Label', 'open');
select pg_temp.check((select string_agg(number::text, ',' order by id) from public.tasks where project_id = 'mp1') = '1,2,3', 'a technician''s duplicate task numbers are replaced (tech sees every task number)');
-- A row brought back from deleted while its number was taken.
update public.tasks set deleted = true where id = 'mt3';
insert into public.tasks (id, project_id, number, title, status) values ('mt4', 'mp1', 0, 'Label again', 'open');
update public.tasks set number = 3 where id = 'mt4';
select pg_temp.check((select number from public.tasks where id = 'mt4') = 4, 'moving onto a deleted row''s number is refused too');
update public.tasks set deleted = false where id = 'mt3';
select pg_temp.check((select count(distinct number) = count(*) from public.tasks where project_id = 'mp1' and not deleted), 'live task numbers stay unique');

-- ---------- the migration's clean-up and the unique indexes ----------
reset role;
alter table public.tasks disable trigger tasks_zz_number;
drop index public.tasks_number_uniq;
insert into public.projects (id, owner_id, client_name, address, status) values ('mp2', '00000000-0000-0000-0000-0000000004a1', 'Sample Two', '2 Example St', 'estimate');
insert into public.tasks (id, project_id, number, title, created_at, updated_at) values
  ('dup-b', 'mp2', 1, 'B', '2026-01-02', '2026-01-02'), ('dup-a', 'mp2', 1, 'A', '2026-01-01', '2026-01-01'),
  ('dup-c', 'mp2', 1, 'C', '2026-01-02', '2026-01-02'), ('dup-d', 'mp2', 2, 'D', '2026-01-03', '2026-01-03'),
  ('dup-z', 'mp2', 0, 'Z', '2026-01-04', '2026-01-04'), ('dup-x', 'mp2', 7, 'X', '2026-01-05', '2026-01-05');
update public.tasks set deleted = true where id = 'dup-x';
select pg_temp.check(public.renumber_job_duplicates() = 3, 'the clean-up moves the duplicates and the unnumbered row');
select pg_temp.check((select string_agg(id || '=' || number, ',' order by id) from public.tasks where project_id = 'mp2') = 'dup-a=1,dup-b=8,dup-c=9,dup-d=2,dup-x=7,dup-z=10',
  'oldest keeps its number; the rest follow the highest number (deleted ones included), oldest first');
select pg_temp.check((select bool_and(updated_at > '2026-06-01') from public.tasks where id in ('dup-b', 'dup-c', 'dup-z')), 'renumbered rows are stamped newer');
select pg_temp.check(public.renumber_job_duplicates() = 0, 'running it again changes nothing');
create unique index tasks_number_uniq on public.tasks (project_id, number) where number > 0 and not deleted;
alter table public.tasks enable trigger tasks_zz_number;
select pg_temp.check(pg_temp.fails($$
  set local session_replication_role = replica;
  insert into public.rfis (id, project_id, number, subject, status) values ('mr-dup', 'mp1', 1, 'x', 'draft')$$), 'the RFI unique index refuses a duplicate even without the trigger');
select pg_temp.check(exists (select 1 from pg_indexes where indexname = 'change_orders_number_uniq'), 'change order numbers are unique among live rows');

-- ---------- OAuth: the cookie hash ----------
set role service_role;
insert into public.integration_oauth_states (nonce, owner_kind, owner_id, provider, verifier, redirect_uri, cookie_hash)
  values ('nonce-money-0123456789', 'user', '00000000-0000-0000-0000-0000000004a1', 'xero', 'enc', 'https://app.example.com/api/integrations/xero/callback', repeat('a', 64));
select pg_temp.check(pg_temp.fails($$insert into public.integration_oauth_states (nonce, owner_kind, owner_id, provider, verifier, redirect_uri, cookie_hash)
  values ('nonce-money-bad-0123456', 'user', '00000000-0000-0000-0000-0000000004a1', 'xero', 'enc', 'r', 'not-a-hash')$$), 'the cookie hash is a sha256 hex digest');
reset role;

select 'MONEY INTEGRITY TESTS PASSED';
