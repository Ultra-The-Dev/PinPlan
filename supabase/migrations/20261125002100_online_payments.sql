-- Online invoice payments (docs/payments.md). Safe to run more than once.
--
-- A company connects its own Stripe account (Stripe Connect, Standard-type account: the company is the merchant of
-- record and has its own Stripe dashboard). The client opens the invoice link (/d?t=…) and pays the balance on a
-- Stripe Checkout page; the charge is made directly on the company's account. When Stripe confirms the payment, the
-- server records it as an ordinary invoice payment (sales_document_payments), so the invoice's balance and status are
-- worked out by the database exactly as for a payment typed in by the office (20261125000400_money_integrity.sql).
--
--   payment_accounts          one row per company (owner_id = billing_owner): its connected Stripe account, whether
--                             Stripe lets it take payments yet, and the office's switches (on/off, US bank account).
--                             The office reads it; only the server (service role) writes it.
--   online_payment_sessions   every Checkout page the server opened: which invoice, which account, how much, and what
--                             became of it. Server only. It is what the webhook trusts: an event is applied only to a
--                             session the server opened, on the account it opened it on.
--   online_payment_target()   (service role) what a client link may pay right now, or why not.
--   online_payment_session_open() / _update(), record_online_payment(), record_online_refund()   (service role)
--   document_public()         the client page also gets `payOnline` {available, ach, payable, processing, paidOnline}.
--
-- Payments recorded here have the id `stripe_<payment intent>` (refunds `stripe_re_<refund>`), method card or ach,
-- and the payment intent as reference. They sync to the apps like any other payment.

-- ---------- tables ----------
create table if not exists public.payment_accounts (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  stripe_account_id text unique check (stripe_account_id is null or stripe_account_id ~ '^acct_[A-Za-z0-9]{6,64}$'),
  charges_enabled boolean not null default false,
  details_submitted boolean not null default false,
  payouts_enabled boolean not null default false,
  -- The office's switches: take card payments on invoice links, and also offer US bank account (ACH) for USD invoices.
  enabled boolean not null default true,
  ach boolean not null default false,
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  default_currency text check (default_currency is null or default_currency ~ '^[a-z]{3}$'),
  connected_by uuid,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.online_payment_sessions (
  id text primary key check (id ~ '^cs_[A-Za-z0-9_]{6,250}$'),
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]{6,64}$'),
  owner_id uuid not null,
  document_id text not null,
  project_id text not null references public.projects (id) on delete cascade,
  link_id text,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  url text,
  expires_at timestamptz,
  status text not null default 'open' check (status in ('open', 'processing', 'paid', 'failed', 'expired', 'canceled')),
  payment_intent text,
  payment_id text,
  applied numeric(14, 2),
  excess numeric(14, 2),
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists online_payment_sessions_doc_idx on public.online_payment_sessions (document_id, status);
create index if not exists online_payment_sessions_intent_idx on public.online_payment_sessions (payment_intent) where payment_intent is not null;

alter table public.payment_accounts enable row level security;
alter table public.online_payment_sessions enable row level security;
revoke all on public.payment_accounts from public, anon, authenticated;
revoke all on public.online_payment_sessions from public, anon, authenticated;
grant select on public.payment_accounts to authenticated;
grant select, insert, update, delete on public.payment_accounts, public.online_payment_sessions to service_role;

-- The office (owner, admins; or someone working alone) sees its company's row. Nobody writes it from the apps.
drop policy if exists payment_accounts_office_read on public.payment_accounts;
create policy payment_accounts_office_read on public.payment_accounts for select to authenticated
  using (owner_id = public.my_billing_owner() and not public.is_tech());

-- ---------- what the client page shows ----------
-- The company a job belongs to (as billing_owner(), without its "only for members" check: the client paying from a
-- link is not a member, and may even be signed in to another company). Internal: callable by no one directly.
create or replace function public.online_payment_owner(pid text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(t.owner_id, p.owner_id)
  from public.projects p
  left join public.team_members m on m.user_id = p.owner_id
  left join public.teams t on t.id = m.team_id
  where p.id = pid;
$$;

-- Pay-online state of an invoice for its client page. Null for quotes and credit notes.
create or replace function public.document_pay_online(d public.sales_documents) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  a public.payment_accounts;
  pending numeric;
  paid_online numeric;
  payable numeric;
begin
  if d.kind is distinct from 'invoice' then return null; end if;
  select * into a from public.payment_accounts where owner_id = public.online_payment_owner(d.project_id);
  select coalesce(sum(amount) filter (where status = 'processing'), 0), coalesce(sum(applied) filter (where status = 'paid'), 0)
    into pending, paid_online
    from public.online_payment_sessions where document_id = d.id and project_id = d.project_id;
  payable := greatest(public.money_round(coalesce(d.balance_due, 0)::numeric - pending), 0);
  return jsonb_build_object(
    'available', coalesce(a.stripe_account_id is not null and a.enabled and a.charges_enabled, false)
                 and d.status not in ('draft', 'void', 'paid') and not coalesce(d.deleted, false) and payable > 0,
    'ach', coalesce(a.ach, false) and lower(coalesce(d.currency, '')) = 'usd',
    'payable', payable,
    'processing', pending,
    'paidOnline', paid_online
  );
end $$;

-- Same as 20261122000000_documents.sql, plus `payOnline`.
create or replace function public.document_public(l public.document_links, d public.sales_documents) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'snapshot', l.snapshot,
    'kind', d.kind,
    'status', d.status,
    'number', coalesce(d.number, l.snapshot ->> 'number'),
    'total', d.total,
    'amountPaid', d.amount_paid,
    'balanceDue', d.balance_due,
    'dueDate', d.due_date,
    'validUntil', d.valid_until,
    'respondedAt', d.responded_at,
    'signerName', d.signer_name,
    'clientNote', d.client_note,
    'paidAt', d.paid_at,
    'expired', d.kind = 'quote' and d.valid_until is not null and d.valid_until < current_date and d.status in ('sent', 'viewed'),
    'overdue', d.kind = 'invoice' and d.due_date is not null and d.due_date < current_date and d.balance_due > 0 and d.status not in ('draft', 'void', 'paid'),
    'payOnline', public.document_pay_online(d)
  );
$$;

-- ---------- server side (service role) ----------
-- What a client link may pay online right now: {ok: true, …} or {ok: false, reason}. Reasons: link (unknown, withdrawn,
-- expired, deleted), not_invoice, not_issued, void, not_enabled (no connected account, switched off, or Stripe doesn't
-- let it take payments yet), paid (nothing left to pay), processing (a bank payment for the rest is on its way).
create or replace function public.online_payment_target(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  l public.document_links;
  d public.sales_documents;
  a public.payment_accounts;
  pending numeric;
  payable numeric;
  reuse public.online_payment_sessions;
  opens jsonb;
  no constant jsonb := jsonb_build_object('ok', false);
begin
  if p_token is null or length(p_token) < 20 then return no || '{"reason": "link"}'; end if;
  select * into l from public.document_links where id = p_token;
  if not found or l.status = 'revoked' or (l.expires_at is not null and l.expires_at <= now()) then return no || '{"reason": "link"}'; end if;
  select * into d from public.sales_documents where id = l.document_id and project_id = l.project_id;
  if not found or d.deleted then return no || '{"reason": "link"}'; end if;
  if d.kind <> 'invoice' then return no || '{"reason": "not_invoice"}'; end if;
  if d.status = 'void' then return no || '{"reason": "void"}'; end if;
  if d.status = 'draft' then return no || '{"reason": "not_issued"}'; end if;
  select * into a from public.payment_accounts where owner_id = public.online_payment_owner(d.project_id);
  if not found or a.stripe_account_id is null or not a.enabled or not a.charges_enabled then return no || '{"reason": "not_enabled"}'; end if;
  if coalesce(d.balance_due, 0) <= 0 then return no || '{"reason": "paid"}'; end if;
  select coalesce(sum(amount), 0) into pending from public.online_payment_sessions
    where document_id = d.id and project_id = d.project_id and status = 'processing';
  payable := public.money_round(d.balance_due::numeric - pending);
  if payable <= 0 then return no || '{"reason": "processing"}'; end if;
  -- An open page for exactly this amount, on this account, with time left: hand it back instead of opening another.
  select * into reuse from public.online_payment_sessions
    where document_id = d.id and project_id = d.project_id and status = 'open' and account_id = a.stripe_account_id
      and amount = payable and url is not null and expires_at > now() + interval '5 minutes'
    order by created_at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'account', s.account_id) order by s.created_at), '[]'::jsonb) into opens
    from public.online_payment_sessions s where s.document_id = d.id and s.project_id = d.project_id and s.status = 'open';
  return jsonb_build_object(
    'ok', true,
    'documentId', d.id,
    'projectId', d.project_id,
    'ownerId', a.owner_id,
    'linkId', l.id,
    'account', a.stripe_account_id,
    'ach', a.ach and lower(d.currency) = 'usd',
    'currency', lower(d.currency),
    'number', coalesce(d.number, l.snapshot ->> 'number'),
    'title', coalesce(nullif(l.snapshot ->> 'title', ''), 'Invoice'),
    'businessName', nullif(l.snapshot -> 'business' ->> 'name', ''),
    'clientEmail', nullif(l.snapshot -> 'client' ->> 'email', ''),
    'balance', d.balance_due,
    'payable', payable,
    'reuse', case when reuse.id is not null then jsonb_build_object('id', reuse.id, 'url', reuse.url) end,
    'openSessions', opens
  );
end $$;

-- The server opened a Checkout page: remember it (repeats are harmless) and retire the invoice's other open pages
-- (the server expired them in Stripe first; one that was paid meanwhile is still recorded by its webhook).
create or replace function public.online_payment_session_open(
  p_id text, p_account text, p_owner uuid, p_document text, p_project text, p_link text,
  p_amount numeric, p_currency text, p_url text, p_expires_at timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.online_payment_sessions (id, account_id, owner_id, document_id, project_id, link_id, amount, currency, url, expires_at)
    values (p_id, p_account, p_owner, p_document, p_project, p_link, public.money_round(p_amount), lower(p_currency), p_url, p_expires_at)
    on conflict (id) do nothing;
  update public.online_payment_sessions set status = 'canceled', updated_at = now()
    where document_id = p_document and project_id = p_project and status = 'open' and id <> p_id;
end $$;

-- A page's state changed without money arriving: processing (a bank payment was started), failed (it bounced),
-- expired. Never changes a paid page. Returns the page's status afterwards, or null when the server never opened it
-- on that account.
create or replace function public.online_payment_session_update(p_id text, p_account text, p_status text, p_intent text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare s public.online_payment_sessions;
begin
  select * into s from public.online_payment_sessions where id = p_id for update;
  if not found or s.account_id <> p_account then return null; end if;
  if s.status = 'paid' then return s.status; end if;
  if p_status = 'processing' and s.status in ('open', 'canceled', 'expired') then
    update public.online_payment_sessions set status = 'processing', payment_intent = coalesce(p_intent, payment_intent), updated_at = now()
      where id = p_id returning * into s;
  elsif p_status = 'failed' and s.status in ('open', 'canceled', 'processing') then
    update public.online_payment_sessions set status = 'failed', payment_intent = coalesce(p_intent, payment_intent), updated_at = now(), completed_at = now()
      where id = p_id returning * into s;
  elsif p_status = 'expired' and s.status in ('open', 'canceled') then
    update public.online_payment_sessions set status = 'expired', updated_at = now() where id = p_id returning * into s;
  end if;
  return s.status;
end $$;

-- Stripe confirmed the money for a page. Under a lock on the page and the invoice: records the part of it the invoice
-- still owes as a payment (once: a repeat answers "duplicate" with the first result), and says how much was more than
-- that (`excess`, which the server refunds). Results: recorded, overpaid (part applied), refused (nothing applied: the
-- invoice is void, deleted, not issued or already paid), duplicate, unknown_session, wrong_account, wrong_currency.
create or replace function public.record_online_payment(
  p_session text, p_account text, p_intent text, p_amount numeric, p_currency text, p_method text, p_paid_on date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.online_payment_sessions;
  d public.sales_documents;
  amt numeric := public.money_round(p_amount);
  v_applied numeric := 0;
  v_res text;
  v_pid text;
begin
  if p_intent is null or p_intent !~ '^pi_[A-Za-z0-9_]{6,250}$' or amt <= 0 then
    return jsonb_build_object('result', 'invalid', 'applied', 0, 'excess', 0);
  end if;
  select * into s from public.online_payment_sessions where id = p_session for update;
  if not found then return jsonb_build_object('result', 'unknown_session', 'applied', 0, 'excess', 0); end if;
  if s.account_id <> p_account then return jsonb_build_object('result', 'wrong_account', 'applied', 0, 'excess', 0); end if;
  if s.status = 'paid' then
    return jsonb_build_object('result', 'duplicate', 'first', s.result, 'applied', s.applied, 'excess', s.excess, 'paymentId', s.payment_id,
                              'documentId', s.document_id, 'projectId', s.project_id);
  end if;
  if lower(coalesce(p_currency, '')) <> s.currency then
    v_res := 'wrong_currency';
  else
    select * into d from public.sales_documents where id = s.document_id and project_id = s.project_id for update;
    if not found or d.deleted or d.kind <> 'invoice' or d.status in ('draft', 'void') then
      v_res := 'refused';
    else
      v_applied := least(amt, greatest(public.money_round(d.balance_due::numeric), 0));
      v_res := case when v_applied <= 0 then 'refused' when v_applied < amt then 'overpaid' else 'recorded' end;
    end if;
  end if;
  if v_applied > 0 then
    v_pid := 'stripe_' || p_intent;
    insert into public.sales_document_payments (id, project_id, document_id, amount, paid_on, method, reference, note)
      values (v_pid, s.project_id, s.document_id, v_applied, coalesce(p_paid_on, current_date),
              case when p_method in ('card', 'ach') then p_method else 'card' end, p_intent, 'Paid online (Stripe)')
      on conflict (id) do nothing;
  end if;
  update public.online_payment_sessions
    set status = 'paid', payment_intent = p_intent, payment_id = v_pid, applied = v_applied, excess = amt - v_applied, result = v_res,
        updated_at = now(), completed_at = now()
    where id = p_session;
  return jsonb_build_object('result', v_res, 'applied', v_applied, 'excess', amt - v_applied, 'paymentId', v_pid,
                            'documentId', s.document_id, 'projectId', s.project_id);
end $$;

-- A refund made in Stripe (by the company, from its dashboard) for a payment recorded above: recorded once as a
-- negative payment, never more than was applied to the invoice. Refunds the server made itself for an excess are not
-- passed here. Results: recorded, duplicate, unknown (no recorded payment for that intent on that account), nothing_left.
create or replace function public.record_online_refund(p_account text, p_intent text, p_refund text, p_amount numeric, p_paid_on date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.online_payment_sessions;
  p public.sales_document_payments;
  refunded numeric;
  amt numeric;
  rid text := 'stripe_re_' || p_refund;
begin
  if p_refund is null or p_refund !~ '^(re|pyr)_[A-Za-z0-9_]{6,250}$' then return jsonb_build_object('result', 'invalid'); end if;
  select * into s from public.online_payment_sessions
    where payment_intent = p_intent and account_id = p_account and status = 'paid' and payment_id is not null
    order by completed_at desc limit 1 for update;
  if not found then return jsonb_build_object('result', 'unknown'); end if;
  if exists (select 1 from public.sales_document_payments where id = rid) then return jsonb_build_object('result', 'duplicate'); end if;
  select * into p from public.sales_document_payments where id = s.payment_id;
  if not found then return jsonb_build_object('result', 'unknown'); end if;
  select coalesce(-sum(amount), 0) into refunded from public.sales_document_payments
    where document_id = s.document_id and project_id = s.project_id and id like 'stripe\_re\_%' and reference = p_intent and not deleted;
  amt := least(public.money_round(p_amount), public.money_round(s.applied - refunded));
  if amt <= 0 then return jsonb_build_object('result', 'nothing_left'); end if;
  insert into public.sales_document_payments (id, project_id, document_id, amount, paid_on, method, reference, note)
    values (rid, s.project_id, s.document_id, -amt, coalesce(p_paid_on, current_date), p.method, p_intent, 'Refunded in Stripe (' || p_refund || ')')
    on conflict (id) do nothing;
  return jsonb_build_object('result', 'recorded', 'amount', amt, 'documentId', s.document_id, 'projectId', s.project_id);
end $$;

revoke all on function public.online_payment_owner(text) from public, anon, authenticated;
revoke all on function public.document_pay_online(public.sales_documents) from public, anon, authenticated;
revoke all on function public.document_public(public.document_links, public.sales_documents) from public, anon, authenticated;
revoke all on function public.online_payment_target(text) from public, anon, authenticated;
revoke all on function public.online_payment_session_open(text, text, uuid, text, text, text, numeric, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.online_payment_session_update(text, text, text, text) from public, anon, authenticated;
revoke all on function public.record_online_payment(text, text, text, numeric, text, text, date) from public, anon, authenticated;
revoke all on function public.record_online_refund(text, text, text, numeric, date) from public, anon, authenticated;
grant execute on function public.online_payment_target(text) to service_role;
grant execute on function public.online_payment_session_open(text, text, uuid, text, text, text, numeric, text, text, timestamptz) to service_role;
grant execute on function public.online_payment_session_update(text, text, text, text) to service_role;
grant execute on function public.record_online_payment(text, text, text, numeric, text, text, date) to service_role;
grant execute on function public.record_online_refund(text, text, text, numeric, date) to service_role;

-- ---------- schema version ----------
create or replace function public.schema_version() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v text := '20261125002100_online_payments';
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
