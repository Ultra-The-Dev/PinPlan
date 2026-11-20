-- Money integrity: the database, not the last device to save, decides an invoice's balance, and per-job numbers
-- (change orders, RFIs, tasks) stay unique when several devices create them offline. Also binds an accounting
-- sign-in to the browser that started it. Safe to run more than once.
--
--   1. integration_oauth_states.cookie_hash: sha256 of the pp_oauth cookie set on the browser that started the sign-in
--      (src/lib/server/integrations/routes.ts). The callback refuses a state whose cookie doesn't match.
--   2. Invoice money: amount_paid, balance_due, status (paid / partially_paid / sent / viewed) and paid_at are worked
--      out here from the invoice's payments and credit notes, with the same rounding as paymentSummary() in
--      src/lib/documents.ts (tests/documents.test.ts and supabase/tests/money_integrity_test.sql check the same cases,
--      tests/fixtures/paymentSummaryCases.json).
--   3. Change order, RFI and task numbers: given under a per-job advisory lock when a device sends 0, nothing, or a
--      number another row of the job already has (deleted rows count, so a number is never handed out twice).

-- ---------- 1. OAuth sign-in bound to the browser ----------
alter table public.integration_oauth_states add column if not exists cookie_hash text
  check (cookie_hash is null or cookie_hash ~ '^[0-9a-f]{64}$');

-- ---------- 2. invoice money ----------
-- Cents, half away from zero (numeric rounding), like money() in src/lib/estimate.ts.
create or replace function public.money_round(x numeric) returns numeric
language sql immutable set search_path = public as $$ select round(coalesce(x, 0), 2) $$;

-- paymentSummary(total, payments, creditNotes) from src/lib/documents.ts. payments: [{amount, date, voided, deleted}],
-- credits: [{total, status, deleted}]. Pure, so the parity test can call it with the same cases as the vitest one.
create or replace function public.payment_summary(p_total double precision, p_payments jsonb, p_credits jsonb,
  out paid numeric, out credited numeric, out balance numeric, out paid_on date)
language plpgsql immutable set search_path = public as $$
declare
  run numeric;
  p record;
  total numeric := coalesce(p_total, 0)::numeric;
begin
  select public.money_round(coalesce(sum((e ->> 'amount')::numeric), 0)) into paid
    from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) e
    where not coalesce((e ->> 'voided')::boolean, false) and not coalesce((e ->> 'deleted')::boolean, false);
  select public.money_round(coalesce(sum((e ->> 'total')::numeric), 0)) into credited
    from jsonb_array_elements(coalesce(p_credits, '[]'::jsonb)) e
    where not coalesce((e ->> 'deleted')::boolean, false) and coalesce(e ->> 'status', 'draft') not in ('draft', 'void');
  balance := public.money_round(total - paid - credited);
  paid_on := null;
  if balance <= 0 and total > 0 then
    run := credited;
    for p in
      select (e ->> 'amount')::numeric as amount, (e ->> 'date')::date as day, ord
      from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) with ordinality as x(e, ord)
      where not coalesce((e ->> 'voided')::boolean, false) and not coalesce((e ->> 'deleted')::boolean, false)
      order by (e ->> 'date'), ord
    loop
      run := public.money_round(run + coalesce(p.amount, 0));
      if run >= total then
        paid_on := p.day;
        exit;
      end if;
    end loop;
  end if;
end $$;

-- An invoice row's money fields from what the database holds (its payments and issued credit notes).
create or replace function public.sales_documents_money() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s record;
  pays jsonb;
  credits jsonb;
  next_status text;
  before jsonb;
begin
  if new.kind <> 'invoice' then return new; end if;
  before := jsonb_build_array(new.amount_paid, new.balance_due, new.status, new.paid_at);
  select coalesce(jsonb_agg(jsonb_build_object('amount', p.amount, 'date', p.paid_on, 'voided', p.voided, 'deleted', p.deleted) order by p.paid_on, p.created_at, p.id), '[]'::jsonb)
    into pays from public.sales_document_payments p where p.document_id = new.id;
  select coalesce(jsonb_agg(jsonb_build_object('total', c.total, 'status', c.status, 'deleted', c.deleted)), '[]'::jsonb)
    into credits from public.sales_documents c where c.kind = 'credit_note' and c.converted_from = new.id;
  select * into s from public.payment_summary(new.total, pays, credits);
  -- invoiceStatus(): drafts and void stay; otherwise the balance decides.
  if new.status in ('draft', 'void') then
    next_status := new.status;
  elsif coalesce(new.total, 0) > 0 and s.balance <= 0 then
    next_status := 'paid';
  elsif s.paid > 0 or s.credited > 0 then
    next_status := 'partially_paid';
  elsif new.viewed_at is not null then
    next_status := 'viewed';
  else
    next_status := 'sent';
  end if;
  new.amount_paid := public.money_round(s.paid + s.credited)::double precision;
  new.balance_due := s.balance::double precision;
  new.status := next_status;
  new.paid_at := case when next_status = 'paid' then coalesce(new.paid_at, s.paid_on) end;
  -- The device sent other numbers: stamp the row newer so its next pull takes the database's.
  if tg_op = 'UPDATE' and before is distinct from jsonb_build_array(new.amount_paid, new.balance_due, new.status, new.paid_at) then
    new.updated_at := greatest(new.updated_at + interval '1 millisecond', now());
  end if;
  return new;
end $$;
-- Sorts after sales_documents_guard / _synced_at / _write_guard, so it sees the status the guard kept.
drop trigger if exists sales_documents_zz_money on public.sales_documents;
create trigger sales_documents_zz_money before insert or update on public.sales_documents
  for each row execute function public.sales_documents_money();

-- Recompute the invoice(s) a payment or credit note belongs to (the BEFORE trigger above does the work).
create or replace function public.refresh_invoice_money(p_ids text[]) returns void
language sql security definer set search_path = public as $$
  update public.sales_documents set updated_at = greatest(updated_at + interval '1 millisecond', now())
  where kind = 'invoice' and id = any (p_ids);
$$;

create or replace function public.sales_document_payments_money() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_invoice_money(array[old.document_id]);
    return old;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - array['updated_at', 'synced_at']) is not distinct from (to_jsonb(old) - array['updated_at', 'synced_at']) then
    return new;
  end if;
  perform public.refresh_invoice_money(array_remove(array[new.document_id, case when tg_op = 'UPDATE' and old.document_id <> new.document_id then old.document_id end], null));
  return new;
end $$;
drop trigger if exists sales_document_payments_money on public.sales_document_payments;
create trigger sales_document_payments_money after insert or update or delete on public.sales_document_payments
  for each row execute function public.sales_document_payments_money();

create or replace function public.sales_documents_credit_money() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids text[] := '{}';
begin
  if tg_op in ('UPDATE', 'DELETE') and old.kind = 'credit_note' and old.converted_from is not null then ids := ids || old.converted_from; end if;
  if tg_op in ('INSERT', 'UPDATE') and new.kind = 'credit_note' and new.converted_from is not null then
    if tg_op = 'INSERT' or new.total is distinct from old.total or new.status is distinct from old.status
       or new.deleted is distinct from old.deleted or new.converted_from is distinct from old.converted_from then
      ids := ids || new.converted_from;
    elsif tg_op = 'UPDATE' then
      ids := '{}';
    end if;
  end if;
  if cardinality(ids) > 0 then perform public.refresh_invoice_money(ids); end if;
  return null;
end $$;
drop trigger if exists sales_documents_credit_money on public.sales_documents;
create trigger sales_documents_credit_money after insert or update or delete on public.sales_documents
  for each row execute function public.sales_documents_credit_money();

revoke all on function public.payment_summary(double precision, jsonb, jsonb) from public, anon;
revoke all on function public.refresh_invoice_money(text[]) from public, anon, authenticated;
revoke all on function public.sales_documents_money() from public, anon;
revoke all on function public.sales_document_payments_money() from public, anon;
revoke all on function public.sales_documents_credit_money() from public, anon;
grant execute on function public.payment_summary(double precision, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.money_round(numeric) to authenticated, service_role;

-- Bring existing invoices in line once (issued ones already numbered and drafts: this must not hand out numbers).
update public.sales_documents set updated_at = updated_at where kind = 'invoice' and (number is not null or status = 'draft');

-- ---------- 3. per-job numbers ----------
-- Change orders: a revision keeps its number while the original is void or rejected, so for them "taken" means held by
-- a deleted row or a row that is still in play (draft, sent, approved).
create or replace function public.job_number_taken(p_table text, p_project text, p_number integer, p_id text, p_live_only boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare hit boolean;
begin
  if p_table = 'change_orders' then
    execute format('select exists (select 1 from public.change_orders where project_id = $1 and number = $2 and id <> $3 and %s)',
      case when p_live_only then 'not deleted and status not in (''void'', ''rejected'')' else '(deleted or status not in (''void'', ''rejected''))' end)
      into hit using p_project, p_number, p_id;
  else
    execute format('select exists (select 1 from public.%I where project_id = $1 and number = $2 and id <> $3 %s)', p_table,
      case when p_live_only then 'and not deleted' else '' end)
      into hit using p_project, p_number, p_id;
  end if;
  return hit;
end $$;

create or replace function public.job_number_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  need boolean := false;
  hit boolean;
  top integer;
begin
  if tg_table_name not in ('change_orders', 'rfis', 'tasks') then return new; end if;
  -- An upsert of a row that exists fires this INSERT trigger first: leave it to the UPDATE that follows.
  if tg_op = 'INSERT' then
    execute format('select exists (select 1 from public.%I where id = $1)', tg_table_name) into hit using new.id;
    if hit then return new; end if;
  end if;
  if tg_op = 'UPDATE' and new.number is not distinct from old.number and new.deleted and old.deleted then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.project_id));
  if new.number is null or new.number <= 0 then
    need := true;
  elsif tg_op = 'INSERT' or new.number is distinct from old.number then
    need := public.job_number_taken(tg_table_name, new.project_id, new.number, new.id, false);
  elsif not new.deleted then
    -- Same number as before: only a clash with another live row (e.g. a row brought back from deleted) moves it.
    need := public.job_number_taken(tg_table_name, new.project_id, new.number, new.id, true);
  end if;
  if need then
    execute format('select coalesce(max(number), 0) from public.%I where project_id = $1 and id <> $2', tg_table_name)
      into top using new.project_id, new.id;
    new.number := top + 1;
    new.updated_at := greatest(coalesce(new.updated_at, now()) + interval '1 millisecond', now());
  end if;
  return new;
end $$;

-- Existing duplicates: the earliest row (created_at, then id) keeps its number, the others get the next free ones in
-- the same order. Stamped newer so devices pull the new numbers. Returns how many rows moved.
create or replace function public.renumber_job_duplicates() returns integer
language plpgsql set search_path = public as $$
declare
  t text;
  r record;
  top integer;
  live text;
  moved integer := 0;
begin
  foreach t in array array['change_orders', 'rfis', 'tasks'] loop
    live := case when t = 'change_orders' then 'not deleted and status not in (''void'', ''rejected'')' else 'not deleted' end;
    for r in execute format(
      'select id, project_id, created_at from (
         select id, project_id, created_at, row_number() over (partition by project_id, number order by created_at, id) as rn
         from public.%I where number > 0 and %s
       ) x where rn > 1
       union all
       select id, project_id, created_at from public.%I where (number is null or number <= 0) and not deleted
       order by project_id, created_at, id', t, live, t)
    loop
      execute format('select coalesce(max(number), 0) from public.%I where project_id = $1', t) into top using r.project_id;
      execute format('update public.%I set number = $1, updated_at = greatest(updated_at + interval ''1 millisecond'', now()) where id = $2', t)
        using top + 1, r.id;
      moved := moved + 1;
    end loop;
  end loop;
  return moved;
end $$;
revoke all on function public.renumber_job_duplicates() from public, anon, authenticated;
select public.renumber_job_duplicates();

create unique index if not exists change_orders_number_uniq on public.change_orders (project_id, number)
  where number > 0 and not deleted and status not in ('void', 'rejected');
create unique index if not exists rfis_number_uniq on public.rfis (project_id, number) where number > 0 and not deleted;
create unique index if not exists tasks_number_uniq on public.tasks (project_id, number) where number > 0 and not deleted;

-- Named to sort after the other row guards (a guard that keeps the old row must not undo a renumber).
do $$
declare t text;
begin
  foreach t in array array['change_orders', 'rfis', 'tasks'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_zz_number', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.job_number_guard()', t || '_zz_number', t);
  end loop;
end $$;

revoke all on function public.job_number_taken(text, text, integer, text, boolean) from public, anon, authenticated;
revoke all on function public.job_number_guard() from public, anon;

notify pgrst, 'reload schema';
