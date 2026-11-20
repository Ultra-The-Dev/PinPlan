-- Online invoice payments (20261125002100_online_payments.sql): connected accounts, Checkout pages, payments recorded
-- once from Stripe's confirmation, overpayment / void / wrong account, refunds, and who can see what. Run after the
-- migrations from the repo root (scripts/test-supabase.sh). Any failed check raises an exception.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000ca01', 'powner@example.com'),
                                          ('00000000-0000-0000-0000-00000000ca02', 'ptech@example.com'),
                                          ('00000000-0000-0000-0000-00000000ca03', 'poffice@example.com'),
                                          ('00000000-0000-0000-0000-00000000cb01', 'pother@example.com');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'ONLINE PAYMENTS CHECK FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
grant execute on function pg_temp.check(boolean, text), pg_temp.fails(text), pg_temp.as_user(text), pg_temp.as_service() to anon, authenticated, service_role;

-- ---------- a company with a job, an invoice and its client link ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca01');
insert into public.projects (id, client_name, address, status) values ('pp1', 'Sample Client', '1 Example St', 'estimate');
select pg_temp.check(public.create_team('Pay Co', 'Olivia') is not null, 'owner creates a team');
insert into public.team_invites (code, team_id, role, name, email) values ('PAYTECH01', public.my_team_id(), 'tech', 'Tom', null), ('PAYOFFICE1', public.my_team_id(), 'admin', 'Ann', 'poffice@example.com');
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca02');
select pg_temp.check(public.accept_team_invite('PAYTECH01', '') ->> 'role' = 'tech', 'tech joins');
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca03');
select pg_temp.check(public.accept_team_invite('PAYOFFICE1', '') ->> 'role' = 'admin', 'admin joins');
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca01');

insert into public.sales_documents (id, project_id, kind, status, issue_date, total, currency) values ('pi1', 'pp1', 'invoice', 'sent', '2026-11-19', 1000, 'USD');
insert into public.sales_documents (id, project_id, kind, status, issue_date, total, currency) values ('pq1', 'pp1', 'quote', 'sent', '2026-11-19', 500, 'USD');
insert into public.document_links (id, document_id, project_id, snapshot)
  values ('tok_pay_invoice_000001', 'pi1', 'pp1', '{"title": "Invoice", "business": {"name": "Pay Co"}, "client": {"name": "Sam", "email": "sam@example.com"}}'),
         ('tok_pay_quote_00000001', 'pq1', 'pp1', '{"title": "Quote"}');

-- ---------- nothing until the company connects Stripe ----------
set role anon;
select pg_temp.check((public.get_document('tok_pay_invoice_000001') -> 'payOnline' ->> 'available') = 'false', 'no connected account: the client page offers no online payment');
select pg_temp.check(public.get_document('tok_pay_quote_00000001') -> 'payOnline' = 'null'::jsonb or public.get_document('tok_pay_quote_00000001') -> 'payOnline' is null, 'quotes have no pay-online state');
select pg_temp.check(pg_temp.fails($$select public.online_payment_target('tok_pay_invoice_000001')$$), 'anon cannot ask what a link may pay');
select pg_temp.check(pg_temp.fails($$select public.record_online_payment('cs_test_000001', 'acct_test0001', 'pi_test_000001', 10, 'usd', 'card', current_date)$$), 'anon cannot record an online payment');
select pg_temp.check(pg_temp.fails($$select count(*) from public.payment_accounts$$), 'anon cannot read connected accounts');
select pg_temp.check(pg_temp.fails($$select count(*) from public.online_payment_sessions$$), 'anon cannot read payment pages');

set role authenticated;
select pg_temp.check(pg_temp.fails($$insert into public.payment_accounts (owner_id, stripe_account_id, charges_enabled) values ('00000000-0000-0000-0000-00000000ca01', 'acct_forged001', true)$$), 'the office cannot write its connected account (the server does)');
select pg_temp.check(pg_temp.fails($$select public.record_online_payment('cs_test_000001', 'acct_test0001', 'pi_test_000001', 10, 'usd', 'card', current_date)$$), 'the office cannot record an online payment itself');
select pg_temp.check(pg_temp.fails($$select public.online_payment_session_open('cs_test_000001', 'acct_test0001', '00000000-0000-0000-0000-00000000ca01', 'pi1', 'pp1', null, 10, 'usd', null, now())$$), 'the office cannot open payment pages');
select pg_temp.check(pg_temp.fails($$select count(*) from public.online_payment_sessions$$), 'the office cannot read payment pages directly');

-- ---------- the server connects the account (service role) ----------
reset role;
set role service_role;
select pg_temp.as_service();
select pg_temp.check(public.online_payment_target('tok_pay_invoice_000001') ->> 'reason' = 'not_enabled', 'no account: not enabled');
insert into public.payment_accounts (owner_id, stripe_account_id, charges_enabled, details_submitted, enabled, ach)
  values ('00000000-0000-0000-0000-00000000ca01', 'acct_paycoA001', false, false, true, true);
select pg_temp.check(public.online_payment_target('tok_pay_invoice_000001') ->> 'reason' = 'not_enabled', 'onboarding not finished: not enabled');
update public.payment_accounts set charges_enabled = true, details_submitted = true where owner_id = '00000000-0000-0000-0000-00000000ca01';
select pg_temp.check(pg_temp.fails($$insert into public.payment_accounts (owner_id, stripe_account_id) values ('00000000-0000-0000-0000-00000000cb01', 'not-an-account')$$), 'account ids are checked');

-- Who sees the row: the owner and the admin, not the technician or another company.
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca01');
select pg_temp.check((select count(*) from public.payment_accounts) = 1, 'the owner sees the company''s connected account');
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca03');
select pg_temp.check((select stripe_account_id from public.payment_accounts) = 'acct_paycoA001', 'an admin sees it too');
select pg_temp.check(pg_temp.fails($$update public.payment_accounts set enabled = false$$) or (select enabled from public.payment_accounts), 'an admin cannot switch it from the app (the server does)');
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca02');
select pg_temp.check((select count(*) from public.payment_accounts) = 0, 'a technician does not see it');
select pg_temp.as_user('00000000-0000-0000-0000-00000000cb01');
select pg_temp.check((select count(*) from public.payment_accounts) = 0, 'another company does not see it');

set role anon;
select pg_temp.check((public.get_document('tok_pay_invoice_000001') -> 'payOnline' ->> 'available') = 'true', 'connected and enabled: the client page offers to pay');
select pg_temp.check((public.get_document('tok_pay_invoice_000001') -> 'payOnline' ->> 'ach') = 'true', 'US bank account offered for a USD invoice when switched on');
select pg_temp.check((public.get_document('tok_pay_invoice_000001') -> 'payOnline' ->> 'payable')::numeric = 1000, 'the whole balance is payable');

-- ---------- a card payment for the whole balance ----------
reset role;
set role service_role;
select pg_temp.as_service();
select pg_temp.check(public.online_payment_target('tok_pay_quote_00000001') ->> 'reason' = 'not_invoice', 'a quote cannot be paid online');
select pg_temp.check(public.online_payment_target('tok_nope_nope_nope_nope') ->> 'reason' = 'link', 'an unknown link cannot be paid');
create temp table tgt as select public.online_payment_target('tok_pay_invoice_000001') as j;
select pg_temp.check((select j ->> 'ok' = 'true' and j ->> 'account' = 'acct_paycoA001' and (j ->> 'payable')::numeric = 1000 and j ->> 'currency' = 'usd'
                      and j ->> 'clientEmail' = 'sam@example.com' and j -> 'reuse' = 'null'::jsonb from tgt), 'the target names the account, the amount and the currency');
select public.online_payment_session_open('cs_test_a00001', 'acct_paycoA001', '00000000-0000-0000-0000-00000000ca01', 'pi1', 'pp1', 'tok_pay_invoice_000001', 1000, 'usd', 'https://checkout.stripe.com/c/pay/cs_test_a00001', now() + interval '30 minutes');
select pg_temp.check(public.online_payment_target('tok_pay_invoice_000001') -> 'reuse' ->> 'id' = 'cs_test_a00001', 'an open page for the same amount is handed back');
-- A second page (e.g. after the first was about to expire) retires the first.
select public.online_payment_session_open('cs_test_a00002', 'acct_paycoA001', '00000000-0000-0000-0000-00000000ca01', 'pi1', 'pp1', 'tok_pay_invoice_000001', 1000, 'usd', 'https://checkout.stripe.com/c/pay/cs_test_a00002', now() + interval '30 minutes');
select pg_temp.check((select status from public.online_payment_sessions where id = 'cs_test_a00001') = 'canceled', 'opening a new page retires the old one');
select public.online_payment_session_open('cs_test_a00002', 'acct_paycoA001', '00000000-0000-0000-0000-00000000ca01', 'pi1', 'pp1', 'tok_pay_invoice_000001', 1000, 'usd', 'https://checkout.stripe.com/c/pay/cs_test_a00002', now() + interval '30 minutes');
select pg_temp.check((select status from public.online_payment_sessions where id = 'cs_test_a00002') = 'open', 'opening the same page again changes nothing');

-- Wrong account and unknown pages are never applied.
select pg_temp.check(public.record_online_payment('cs_test_a00002', 'acct_someoneElse', 'pi_test_a00002', 1000, 'usd', 'card', '2026-11-20') ->> 'result' = 'wrong_account', 'an event from another account is refused');
select pg_temp.check(public.record_online_payment('cs_test_zzzzzz', 'acct_paycoA001', 'pi_test_a00002', 1000, 'usd', 'card', '2026-11-20') ->> 'result' = 'unknown_session', 'a page the server never opened is refused');
select pg_temp.check(public.record_online_payment('cs_test_a00002', 'acct_paycoA001', 'pi_test_a00002', 1000, 'eur', 'card', '2026-11-20') ->> 'result' = 'wrong_currency', 'another currency is not applied');
select pg_temp.check((select balance_due = 1000 from public.sales_documents where id = 'pi1'), 'nothing was recorded for them');
-- (The wrong-currency attempt closed that page; open a fresh one.)
select public.online_payment_session_open('cs_test_a00003', 'acct_paycoA001', '00000000-0000-0000-0000-00000000ca01', 'pi1', 'pp1', 'tok_pay_invoice_000001', 1000, 'usd', 'https://checkout.stripe.com/c/pay/cs_test_a00003', now() + interval '30 minutes');
create temp table r1 as select public.record_online_payment('cs_test_a00003', 'acct_paycoA001', 'pi_test_a00003', 1000, 'usd', 'card', '2026-11-20') as j;
select pg_temp.check((select j ->> 'result' = 'recorded' and (j ->> 'applied')::numeric = 1000 and (j ->> 'excess')::numeric = 0 and j ->> 'paymentId' = 'stripe_pi_test_a00003' from r1), 'the payment is recorded');
select pg_temp.check((select amount = 1000 and method = 'card' and reference = 'pi_test_a00003' and paid_on = '2026-11-20' and not voided from public.sales_document_payments where id = 'stripe_pi_test_a00003'), 'as an ordinary card payment');
select pg_temp.check((select status = 'paid' and balance_due = 0 and amount_paid = 1000 and paid_at = '2026-11-20' from public.sales_documents where id = 'pi1'), 'the invoice is paid');
-- Stripe sends the event again (and the client's return confirms it too).
select pg_temp.check(public.record_online_payment('cs_test_a00003', 'acct_paycoA001', 'pi_test_a00003', 1000, 'usd', 'card', '2026-11-20') ->> 'result' = 'duplicate', 'a repeat is a duplicate');
select pg_temp.check((select count(*) from public.sales_document_payments where document_id = 'pi1') = 1, 'still one payment');
select pg_temp.check(public.online_payment_target('tok_pay_invoice_000001') ->> 'reason' = 'paid', 'a paid invoice cannot be paid again');

-- ---------- a deposit already recorded, the rest paid online; two pages paid at once ----------
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca01');
insert into public.sales_documents (id, project_id, kind, status, issue_date, total, currency) values ('pi2', 'pp1', 'invoice', 'sent', '2026-11-19', 2000, 'USD');
insert into public.sales_document_payments (id, project_id, document_id, amount, paid_on, method) values ('pdep', 'pp1', 'pi2', 500, '2026-11-19', 'check');
insert into public.document_links (id, document_id, project_id, snapshot) values ('tok_pay_invoice_000002', 'pi2', 'pp1', '{"title": "Invoice"}');
reset role;
set role service_role;
select pg_temp.as_service();
select pg_temp.check((public.online_payment_target('tok_pay_invoice_000002') ->> 'payable')::numeric = 1500, 'only the remaining balance is payable');
select public.online_payment_session_open('cs_test_b00001', 'acct_paycoA001', '00000000-0000-0000-0000-00000000ca01', 'pi2', 'pp1', 'tok_pay_invoice_000002', 1500, 'usd', 'https://checkout.stripe.com/c/pay/cs_test_b00001', now() + interval '30 minutes');
-- The client had two tabs open: an older page (retired, but already paid) and this one.
insert into public.online_payment_sessions (id, account_id, owner_id, document_id, project_id, amount, currency, status)
  values ('cs_test_b00000', 'acct_paycoA001', '00000000-0000-0000-0000-00000000ca01', 'pi2', 'pp1', 1500, 'usd', 'canceled');
select pg_temp.check(public.record_online_payment('cs_test_b00001', 'acct_paycoA001', 'pi_test_b00001', 1500, 'usd', 'card', '2026-11-21') ->> 'result' = 'recorded', 'the rest is paid');
create temp table r2 as select public.record_online_payment('cs_test_b00000', 'acct_paycoA001', 'pi_test_b00000', 1500, 'usd', 'card', '2026-11-21') as j;
select pg_temp.check((select j ->> 'result' = 'refused' and (j ->> 'applied')::numeric = 0 and (j ->> 'excess')::numeric = 1500 from r2), 'the second payment is not applied: all of it is excess (refunded by the server)');
select pg_temp.check((select status = 'paid' and balance_due = 0 and amount_paid = 2000 from public.sales_documents where id = 'pi2'), 'the invoice is paid once');
select pg_temp.check(not exists (select 1 from public.sales_document_payments where id = 'stripe_pi_test_b00000'), 'no payment row for the refused one');

-- Overpaid: the office recorded a check while the client was on the page.
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca01');
insert into public.sales_documents (id, project_id, kind, status, issue_date, total, currency) values ('pi3', 'pp1', 'invoice', 'sent', '2026-11-19', 300, 'USD');
insert into public.document_links (id, document_id, project_id, snapshot) values ('tok_pay_invoice_000003', 'pi3', 'pp1', '{"title": "Invoice"}');
reset role;
set role service_role;
select pg_temp.as_service();
select public.online_payment_session_open('cs_test_c00001', 'acct_paycoA001', '00000000-0000-0000-0000-00000000ca01', 'pi3', 'pp1', 'tok_pay_invoice_000003', 300, 'usd', 'https://checkout.stripe.com/c/pay/cs_test_c00001', now() + interval '30 minutes');
insert into public.sales_document_payments (id, project_id, document_id, amount, paid_on, method) values ('pchk3', 'pp1', 'pi3', 100, '2026-11-20', 'check');
create temp table r3 as select public.record_online_payment('cs_test_c00001', 'acct_paycoA001', 'pi_test_c00001', 300, 'usd', 'card', '2026-11-21') as j;
select pg_temp.check((select j ->> 'result' = 'overpaid' and (j ->> 'applied')::numeric = 200 and (j ->> 'excess')::numeric = 100 from r3), 'overpaid: only what was owed is applied, the rest is excess');
select pg_temp.check((select amount = 200 from public.sales_document_payments where id = 'stripe_pi_test_c00001'), 'the payment row holds the applied part');
select pg_temp.check((select status = 'paid' and balance_due = 0 from public.sales_documents where id = 'pi3'), 'and the invoice is paid, not over-credited');

-- Refunds made in Stripe come back as negative payments, once, never more than was applied.
create temp table rf as select public.record_online_refund('acct_paycoA001', 'pi_test_c00001', 're_test_c00001', 50, '2026-11-22') as j;
select pg_temp.check((select j ->> 'result' = 'recorded' and (j ->> 'amount')::numeric = 50 from rf), 'a refund is recorded');
select pg_temp.check((select amount = -50 and method = 'card' from public.sales_document_payments where id = 'stripe_re_re_test_c00001'), 'as a negative card payment');
select pg_temp.check((select status = 'partially_paid' and balance_due = 50 from public.sales_documents where id = 'pi3'), 'the invoice owes it again');
select pg_temp.check(public.record_online_refund('acct_paycoA001', 'pi_test_c00001', 're_test_c00001', 50, '2026-11-22') ->> 'result' = 'duplicate', 'a repeated refund event is a duplicate');
select pg_temp.check((public.record_online_refund('acct_paycoA001', 'pi_test_c00001', 're_test_c00002', 500, '2026-11-22') ->> 'amount')::numeric = 150, 'refunds stop at what was applied');
select pg_temp.check(public.record_online_refund('acct_paycoA001', 'pi_test_c00001', 're_test_c00003', 10, '2026-11-22') ->> 'result' = 'nothing_left', 'nothing more to refund');
select pg_temp.check(public.record_online_refund('acct_someoneElse', 'pi_test_c00001', 're_test_c00004', 10, '2026-11-22') ->> 'result' = 'unknown', 'a refund from another account is ignored');
select pg_temp.check(public.record_online_refund('acct_paycoA001', 'pi_test_b00000', 're_test_b00000', 1500, '2026-11-22') ->> 'result' = 'unknown', 'a refund of a payment that was never applied is ignored');

-- ---------- void invoices ----------
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca01');
insert into public.sales_documents (id, project_id, kind, status, issue_date, total, currency) values ('pi4', 'pp1', 'invoice', 'sent', '2026-11-19', 400, 'USD');
insert into public.document_links (id, document_id, project_id, snapshot) values ('tok_pay_invoice_000004', 'pi4', 'pp1', '{"title": "Invoice"}');
reset role;
set role service_role;
select pg_temp.as_service();
select public.online_payment_session_open('cs_test_d00001', 'acct_paycoA001', '00000000-0000-0000-0000-00000000ca01', 'pi4', 'pp1', 'tok_pay_invoice_000004', 400, 'usd', 'https://checkout.stripe.com/c/pay/cs_test_d00001', now() + interval '30 minutes');
update public.sales_documents set status = 'void' where id = 'pi4';
select pg_temp.check(public.online_payment_target('tok_pay_invoice_000004') ->> 'reason' = 'void', 'a void invoice cannot be paid');
select pg_temp.check((public.record_online_payment('cs_test_d00001', 'acct_paycoA001', 'pi_test_d00001', 400, 'usd', 'card', '2026-11-21') ->> 'excess')::numeric = 400, 'money for a voided invoice is all excess (refunded)');
select pg_temp.check((select status = 'void' and amount_paid = 0 from public.sales_documents where id = 'pi4'), 'the void invoice stays void and unpaid');

-- Credited in full: nothing left to pay.
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca01');
insert into public.sales_documents (id, project_id, kind, status, issue_date, total, currency) values ('pi5', 'pp1', 'invoice', 'sent', '2026-11-19', 250, 'USD');
insert into public.sales_documents (id, project_id, kind, status, total, converted_from) values ('pcn5', 'pp1', 'credit_note', 'sent', 250, 'pi5');
insert into public.document_links (id, document_id, project_id, snapshot) values ('tok_pay_invoice_000005', 'pi5', 'pp1', '{"title": "Invoice"}');
reset role;
set role service_role;
select pg_temp.as_service();
select pg_temp.check(public.online_payment_target('tok_pay_invoice_000005') ->> 'reason' = 'paid', 'a credited invoice cannot be paid');

-- ---------- bank payments (ACH): processing, then succeeded or failed ----------
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca01');
insert into public.sales_documents (id, project_id, kind, status, issue_date, total, currency) values ('pi6', 'pp1', 'invoice', 'sent', '2026-11-19', 800, 'USD');
insert into public.document_links (id, document_id, project_id, snapshot) values ('tok_pay_invoice_000006', 'pi6', 'pp1', '{"title": "Invoice"}');
reset role;
set role service_role;
select pg_temp.as_service();
select public.online_payment_session_open('cs_test_e00001', 'acct_paycoA001', '00000000-0000-0000-0000-00000000ca01', 'pi6', 'pp1', 'tok_pay_invoice_000006', 800, 'usd', 'https://checkout.stripe.com/c/pay/cs_test_e00001', now() + interval '30 minutes');
select pg_temp.check(public.online_payment_session_update('cs_test_e00001', 'acct_someoneElse', 'processing', 'pi_test_e00001') is null, 'another account cannot move a page');
select pg_temp.check(public.online_payment_session_update('cs_test_e00001', 'acct_paycoA001', 'processing', 'pi_test_e00001') = 'processing', 'a bank payment is processing');
select pg_temp.check(public.online_payment_target('tok_pay_invoice_000006') ->> 'reason' = 'processing', 'while it processes, the rest cannot be paid twice');
set role anon;
select pg_temp.check((select (j ->> 'available') = 'false' and (j ->> 'processing')::numeric = 800 from (select public.get_document('tok_pay_invoice_000006') -> 'payOnline' as j) x), 'the client page says it is processing');
reset role;
set role service_role;
select pg_temp.as_service();
select pg_temp.check(public.online_payment_session_update('cs_test_e00001', 'acct_paycoA001', 'failed', 'pi_test_e00001') = 'failed', 'the bank payment failed');
select pg_temp.check((public.online_payment_target('tok_pay_invoice_000006') ->> 'payable')::numeric = 800, 'after a failure the balance can be paid again');
select public.online_payment_session_open('cs_test_e00002', 'acct_paycoA001', '00000000-0000-0000-0000-00000000ca01', 'pi6', 'pp1', 'tok_pay_invoice_000006', 800, 'usd', 'https://checkout.stripe.com/c/pay/cs_test_e00002', now() + interval '30 minutes');
select pg_temp.check(public.online_payment_session_update('cs_test_e00002', 'acct_paycoA001', 'processing', 'pi_test_e00002') = 'processing', 'a second bank payment');
select pg_temp.check(public.record_online_payment('cs_test_e00002', 'acct_paycoA001', 'pi_test_e00002', 800, 'usd', 'ach', '2026-11-24') ->> 'result' = 'recorded', 'it succeeded and is recorded');
select pg_temp.check((select method = 'ach' from public.sales_document_payments where id = 'stripe_pi_test_e00002'), 'as a bank payment');
select pg_temp.check(public.online_payment_session_update('cs_test_e00002', 'acct_paycoA001', 'failed', 'pi_test_e00002') = 'paid', 'a paid page never goes back');
set role anon;
select pg_temp.check((select (j ->> 'available') = 'false' and (j ->> 'paidOnline')::numeric = 800 from (select public.get_document('tok_pay_invoice_000006') -> 'payOnline' as j) x), 'the client page shows it was paid online');

-- ---------- switched off ----------
reset role;
set role service_role;
select pg_temp.as_service();
update public.payment_accounts set enabled = false where owner_id = '00000000-0000-0000-0000-00000000ca01';
select pg_temp.check(public.online_payment_target('tok_pay_invoice_000003') ->> 'reason' = 'not_enabled', 'switched off: links cannot be paid online');
reset role;

-- The office still sees the payments like any other (synced to the apps).
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca03');
select pg_temp.check((select count(*) from public.sales_document_payments where id like 'stripe\_%') = 6, 'the office sees online payments and refunds');
select pg_temp.as_user('00000000-0000-0000-0000-00000000ca02');
select pg_temp.check((select count(*) from public.sales_document_payments) = 0, 'a technician does not');
reset role;

select 'online payments checks PASSED' as result;
