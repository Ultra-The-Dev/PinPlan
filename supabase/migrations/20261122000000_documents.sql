-- Quotes, invoices and credit notes made in PinPlan (for companies that don't use Billdu or QuickBooks).
-- See docs/documents.md for the data model, statuses, numbering and the JSON shapes. Safe to run more than once.
--
--   sales_documents          one row per quote / invoice / credit note; belongs to a job (synced like other job tables)
--   sales_document_payments  payments (+) and refunds (−) against an invoice (synced)
--   document_settings        company-wide invoicing settings (labels, number formats, terms, taxes…), one row per company
--   document_counters        per-company number sequences; only the functions below touch it
--   document_links           published client links: a frozen snapshot read by token through get_document()
--
-- Money is office work: technicians can't read or write any of it. Numbers are given by the database when a document
-- is issued (status leaves 'draft'), so they are unique per company even when people issue them offline at once.

-- ---------- who owns the numbering: the job owner's team owner, or the job owner when they work alone ----------
create or replace function public.billing_owner(pid text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(t.owner_id, p.owner_id)
  from public.projects p
  left join public.team_members m on m.user_id = p.owner_id
  left join public.teams t on t.id = m.team_id
  where p.id = pid;
$$;

create or replace function public.my_billing_owner() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select t.owner_id from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = auth.uid()), auth.uid());
$$;

-- ---------- documents ----------
create table if not exists public.sales_documents (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  -- Set by the database (billing_owner of the job): numbering and uniqueness are per company.
  owner_id uuid,
  kind text not null check (kind in ('quote', 'invoice', 'credit_note')),
  title text,
  number text,
  number_seq integer,
  status text not null default 'draft' check (status in ('draft', 'sent', 'viewed', 'accepted', 'declined', 'partially_paid', 'paid', 'void')),
  issue_date date,
  due_date date,
  valid_until date,
  terms_days integer,
  client jsonb not null default '{}'::jsonb,
  lines jsonb not null default '[]'::jsonb,
  discount jsonb,
  taxes jsonb not null default '[]'::jsonb,
  fees jsonb,
  deposit jsonb,
  -- Final invoices: [{id, label, amount}] already invoiced, taken off after tax.
  deductions jsonb,
  currency text not null default 'USD',
  notes text,
  terms text,
  footer text,
  internal_notes text,
  options jsonb,
  subtotal double precision not null default 0,
  discount_total double precision not null default 0,
  tax_total double precision not null default 0,
  total double precision not null default 0,
  amount_paid double precision not null default 0,
  balance_due double precision not null default 0,
  source text not null default 'manual' check (source in ('manual', 'estimate', 'quote', 'invoice', 'duplicate')),
  converted_from text,
  invoice_type text check (invoice_type is null or invoice_type in ('standard', 'deposit', 'progress', 'final')),
  billed_pct double precision,
  share_token text,
  share_hash text,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  signer_name text,
  signature text check (signature is null or length(signature) <= 400000),
  client_note text,
  paid_at date,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
alter table public.sales_documents add column if not exists deductions jsonb;
create index if not exists sales_documents_project_idx on public.sales_documents (project_id);
create index if not exists sales_documents_owner_idx on public.sales_documents (owner_id);
create unique index if not exists sales_documents_number_uniq on public.sales_documents (owner_id, kind, number) where number is not null;

create table if not exists public.sales_document_payments (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  document_id text not null,
  amount double precision not null default 0,
  paid_on date not null default current_date,
  method text not null default 'other' check (method in ('cash', 'check', 'card', 'ach', 'zelle', 'other')),
  reference text,
  note text,
  voided boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists sales_document_payments_project_idx on public.sales_document_payments (project_id);
create index if not exists sales_document_payments_doc_idx on public.sales_document_payments (document_id);

-- ---------- company settings and counters ----------
create table if not exists public.document_settings (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  -- DocumentSettings (src/lib/types.ts) as JSON. config -> 'kinds' -> <kind> ->> 'format' / 'yearlyReset' drive numbering.
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.document_counters (
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('quote', 'invoice', 'credit_note')),
  -- The year for counters that start again each January, else 0.
  period integer not null default 0,
  next_value integer not null default 1 check (next_value >= 1),
  primary key (owner_id, kind, period)
);

-- ---------- client links ----------
create table if not exists public.document_links (
  -- The link token (random, 20+ chars). Knowing it is what lets a client open the document.
  id text primary key check (length(id) >= 20),
  document_id text not null,
  project_id text not null references public.projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- DocSnapshot (src/lib/documents.ts): everything the client page shows. Never changes after publishing.
  snapshot jsonb not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  viewed_at timestamptz,
  view_count integer not null default 0,
  responded_at timestamptz,
  response_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_links_doc_idx on public.document_links (document_id);
create index if not exists document_links_project_idx on public.document_links (project_id);

-- ---------- synced_at triggers + watermark indexes (like the other synced tables) ----------
do $$
declare t text;
begin
  foreach t in array array['sales_documents', 'sales_document_payments'] loop
    execute format('drop trigger if exists %I_synced_at on public.%I', t, t);
    execute format('create trigger %I_synced_at before insert or update on public.%I for each row execute function public.set_synced_at()', t, t);
    execute format('create index if not exists %I_synced_at_idx on public.%I (synced_at)', t, t);
  end loop;
end $$;

-- ---------- numbering ----------
-- Mirrors formatDocNumber() in src/lib/documents.ts: {YYYY} {YY} {MM}; {0…0} pads the counter (never cuts it); {#} bare.
create or replace function public.format_document_number(p_format text, p_seq integer, p_date date) returns text
language plpgsql immutable set search_path = public as $$
declare
  f text := coalesce(nullif(trim(p_format), ''), '{0000}');
  m text[];
begin
  if f !~ '\{(0+|#)\}' then f := f || '{0000}'; end if;
  f := replace(f, '{YYYY}', to_char(p_date, 'YYYY'));
  f := replace(f, '{YY}', to_char(p_date, 'YY'));
  f := replace(f, '{MM}', to_char(p_date, 'MM'));
  f := replace(f, '{#}', p_seq::text);
  loop
    m := regexp_match(f, '\{(0+)\}');
    exit when m is null;
    f := regexp_replace(f, '\{0+\}', lpad(p_seq::text, greatest(length(m[1]), length(p_seq::text)), '0'));
  end loop;
  return f;
end $$;

create or replace function public.document_number_format(p_owner uuid, p_kind text) returns table (fmt text, yearly boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(c ->> 'format', ''), d.fmt),
         coalesce((c ->> 'yearlyReset')::boolean, d.yearly)
  from (select case p_kind when 'invoice' then 'INV-{YYYY}-{0000}' when 'credit_note' then 'CN-{0000}' else 'EST-{0000}' end as fmt,
               p_kind = 'invoice' as yearly) d
  left join lateral (select s.config -> 'kinds' -> p_kind as c from public.document_settings s where s.owner_id = p_owner) x on true;
$$;

-- Takes the next number for a company (row-locked, so two issues at once never get the same one). Skips numbers that
-- are already used (e.g. after someone set the counter back).
create or replace function public.take_document_number(p_project text, p_kind text, p_date date, out num text, out seq integer)
language plpgsql security definer set search_path = public as $$
declare f record; per integer; p_owner uuid := public.billing_owner(p_project);
begin
  -- Called by the row guard as the person saving the row: only for a job of theirs, and never by a technician.
  if auth.uid() is not null and (not public.is_project_member(p_project) or public.is_tech()) then
    raise exception 'Not your job' using errcode = '42501';
  end if;
  if p_owner is null or p_kind not in ('quote', 'invoice', 'credit_note') then
    raise exception 'Unknown job or kind' using errcode = '22023';
  end if;
  select * into f from public.document_number_format(p_owner, p_kind);
  per := case when f.yearly then extract(year from p_date)::int else 0 end;
  insert into public.document_counters (owner_id, kind, period, next_value) values (p_owner, p_kind, per, 1) on conflict do nothing;
  loop
    update public.document_counters set next_value = next_value + 1
      where owner_id = p_owner and kind = p_kind and period = per
      returning next_value - 1 into seq;
    num := public.format_document_number(f.fmt, seq, p_date);
    exit when not exists (select 1 from public.sales_documents d where d.owner_id = p_owner and d.kind = p_kind and d.number = num);
  end loop;
end $$;

-- Invoker rights on purpose (current_user tells the apps apart from our own functions). What it enforces:
--   * owner_id is the job's company; kind can't change once numbered
--   * the number is given by the database when the document leaves 'draft', and never changes after that
--   * the client's answer (from the link) and "viewed" survive a device pushing an older copy of the row
create or replace function public.sales_documents_guard() returns trigger
language plpgsql set search_path = public as $$
declare r record;
begin
  if tg_op = 'UPDATE' then
    new.owner_id := coalesce(old.owner_id, public.billing_owner(new.project_id));
    if old.number is not null then
      new.number := old.number;
      new.number_seq := old.number_seq;
      new.kind := old.kind;
    end if;
    if old.responded_at is not null then
      new.responded_at := old.responded_at;
      new.signer_name := old.signer_name;
      new.signature := old.signature;
      new.client_note := coalesce(new.client_note, old.client_note);
      if old.status in ('accepted', 'declined') and new.status in ('draft', 'sent', 'viewed') then new.status := old.status; end if;
    end if;
    if old.viewed_at is not null then
      new.viewed_at := coalesce(new.viewed_at, old.viewed_at);
      if new.status = 'sent' then new.status := 'viewed'; end if;
    end if;
  else
    new.owner_id := public.billing_owner(new.project_id);
  end if;
  -- Numbers only come from the counter (the apps never send one that sticks).
  if (tg_op = 'INSERT' or old.number is null) and current_user in ('authenticated', 'anon') then
    new.number := null;
    new.number_seq := null;
    -- The answer fields are written by respond_document only.
    if tg_op = 'INSERT' then
      new.responded_at := null; new.signer_name := null; new.signature := null;
    elsif old.responded_at is null then
      -- (The office may still mark a quote accepted / declined by hand, e.g. for a signed paper copy.)
      new.responded_at := null; new.signer_name := null; new.signature := null;
    end if;
  end if;
  -- An upsert of a row that already exists fires this INSERT trigger before turning into an UPDATE: number it on the
  -- UPDATE only, or every sync of an issued document would burn a number (gaps in the sequence).
  if new.number is null and new.status <> 'draft' and not new.deleted and new.owner_id is not null
     and not (tg_op = 'INSERT' and exists (select 1 from public.sales_documents x where x.id = new.id)) then
    select * into r from public.take_document_number(new.project_id, new.kind, coalesce(new.issue_date, current_date));
    new.number := r.num;
    new.number_seq := r.seq;
    new.issue_date := coalesce(new.issue_date, current_date);
    -- Newer than the device's copy, so its next pull takes the number.
    new.updated_at := greatest(new.updated_at, now());
  end if;
  return new;
end $$;
drop trigger if exists sales_documents_guard on public.sales_documents;
create trigger sales_documents_guard before insert or update on public.sales_documents
  for each row execute function public.sales_documents_guard();

-- ---------- row-level security: office only ----------
alter table public.sales_documents enable row level security;
alter table public.sales_document_payments enable row level security;
alter table public.document_settings enable row level security;
alter table public.document_counters enable row level security;
alter table public.document_links enable row level security;

drop policy if exists sales_documents_office on public.sales_documents;
create policy sales_documents_office on public.sales_documents for all
  using (public.is_project_member(project_id) and not public.is_tech())
  with check (public.is_project_member(project_id) and not public.is_tech());

drop policy if exists sales_document_payments_office on public.sales_document_payments;
create policy sales_document_payments_office on public.sales_document_payments for all
  using (public.is_project_member(project_id) and not public.is_tech())
  with check (public.is_project_member(project_id) and not public.is_tech());

-- Everyone in the office reads the company's settings; the owner and admins change them (a solo user owns their own).
drop policy if exists document_settings_read on public.document_settings;
create policy document_settings_read on public.document_settings for select
  using (owner_id = public.my_billing_owner() and not public.is_tech());
drop policy if exists document_settings_write on public.document_settings;
create policy document_settings_write on public.document_settings for insert
  with check (owner_id = public.my_billing_owner() and not public.is_tech());
drop policy if exists document_settings_update on public.document_settings;
create policy document_settings_update on public.document_settings for update
  using (owner_id = public.my_billing_owner() and not public.is_tech())
  with check (owner_id = public.my_billing_owner() and not public.is_tech());

drop policy if exists document_links_office on public.document_links;
create policy document_links_office on public.document_links for all
  using (public.is_project_member(project_id) and not public.is_tech())
  with check (owner_id = auth.uid() and public.is_project_member(project_id) and not public.is_tech());
-- No policies on document_counters: only the functions here read and write it.

-- The answer stamp and the notification stamp on links are the server's; the apps may only revoke.
create or replace function public.document_links_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user in ('authenticated', 'anon') then
    new.response_notified_at := old.response_notified_at;
    new.responded_at := old.responded_at;
    new.viewed_at := old.viewed_at;
    new.view_count := old.view_count;
    new.snapshot := old.snapshot;
    new.document_id := old.document_id;
    new.project_id := old.project_id;
    if old.status = 'revoked' then new.status := 'revoked'; end if;
  end if;
  return new;
end $$;
drop trigger if exists document_links_guard on public.document_links;
create trigger document_links_guard before update on public.document_links
  for each row execute function public.document_links_guard();

-- ---------- read-only when the subscription has lapsed (same guard as the other job tables) ----------
do $$
declare t text;
begin
  foreach t in array array['sales_documents', 'sales_document_payments', 'document_links'] loop
    execute format('drop trigger if exists %I_write_guard on public.%I', t, t);
    execute format('create trigger %I_write_guard before insert or update on public.%I for each row execute function public.job_write_guard()', t, t);
  end loop;
end $$;

-- ---------- office functions ----------
-- Issue a draft now (online): it becomes 'sent' and gets its number. Returns the number. Offline devices simply push
-- the row with status 'sent' and the guard above numbers it on arrival.
create or replace function public.issue_document(p_id text) returns text
language plpgsql security definer set search_path = public as $$
declare d public.sales_documents;
begin
  select * into d from public.sales_documents where id = p_id for update;
  if not found or d.deleted or not public.is_project_member(d.project_id) or public.is_tech() then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if not public.team_can_write(public.project_owner(d.project_id)) then
    raise exception 'PinPlan subscription inactive' using errcode = 'P0001';
  end if;
  if d.number is not null then return d.number; end if;
  update public.sales_documents set
    status = case when status = 'draft' then 'sent' else status end,
    issue_date = coalesce(issue_date, current_date),
    due_date = coalesce(due_date, case when terms_days is not null then coalesce(issue_date, current_date) + terms_days end),
    sent_at = coalesce(sent_at, now()),
    updated_at = now()
  where id = p_id
  returning number into d.number;
  return d.number;
end $$;

-- The next numbers per kind for the caller's company (Settings → Invoicing shows them).
create or replace function public.document_numbering() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o uuid := public.my_billing_owner(); k text; f record; per integer; nxt integer; out jsonb := '{}'::jsonb;
begin
  if o is null or public.is_tech() then return null; end if;
  foreach k in array array['quote', 'invoice', 'credit_note'] loop
    select * into f from public.document_number_format(o, k);
    per := case when f.yearly then extract(year from current_date)::int else 0 end;
    select next_value into nxt from public.document_counters where owner_id = o and kind = k and period = per;
    out := out || jsonb_build_object(k, jsonb_build_object('next', coalesce(nxt, 1), 'preview', public.format_document_number(f.fmt, coalesce(nxt, 1), current_date)));
  end loop;
  return out;
end $$;

-- Set the next number for a kind (owner / admin, or a solo user). Numbers already used are still skipped.
create or replace function public.set_document_next_number(p_kind text, p_next integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o uuid := public.my_billing_owner(); f record; per integer;
begin
  if o is null or public.is_tech() or coalesce(public.my_team_role(), 'owner') not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can change numbering' using errcode = '42501';
  end if;
  if p_kind not in ('quote', 'invoice', 'credit_note') or p_next is null or p_next < 1 or p_next > 99999999 then
    raise exception 'Enter a number from 1 up' using errcode = '22023';
  end if;
  select * into f from public.document_number_format(o, p_kind);
  per := case when f.yearly then extract(year from current_date)::int else 0 end;
  insert into public.document_counters (owner_id, kind, period, next_value) values (o, p_kind, per, p_next)
    on conflict (owner_id, kind, period) do update set next_value = excluded.next_value;
  return public.document_numbering();
end $$;

-- ---------- client side (no account): read and answer by link token ----------
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
    'overdue', d.kind = 'invoice' and d.due_date is not null and d.due_date < current_date and d.balance_due > 0 and d.status not in ('draft', 'void', 'paid')
  );
$$;

-- Opens a document by its link. Marks it viewed. Null for unknown, withdrawn or deleted links.
create or replace function public.get_document(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.document_links; d public.sales_documents;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into l from public.document_links where id = p_token;
  if not found or l.status = 'revoked' then return null; end if;
  select * into d from public.sales_documents where id = l.document_id;
  if not found or d.deleted then return null; end if;
  update public.document_links set viewed_at = coalesce(viewed_at, now()), view_count = view_count + 1 where id = p_token;
  if d.status = 'sent' then
    update public.sales_documents set status = 'viewed', viewed_at = coalesce(viewed_at, now()), updated_at = now() where id = d.id returning * into d;
  elsif d.viewed_at is null and d.status <> 'draft' then
    update public.sales_documents set viewed_at = now() where id = d.id returning * into d;
  end if;
  return public.document_public(l, d);
end $$;

-- Accept (name + signature when the quote asks for one) or decline (with a note). Quotes only, once, before they expire.
create or replace function public.respond_document(p_token text, p_accept boolean, p_name text, p_signature text, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.document_links; d public.sales_documents; need_sig boolean;
begin
  select * into l from public.document_links where id = p_token for update;
  if not found or l.status = 'revoked' then raise exception 'This link is no longer available.'; end if;
  select * into d from public.sales_documents where id = l.document_id for update;
  if not found or d.deleted or d.status = 'void' then raise exception 'This document is no longer available.'; end if;
  if d.kind <> 'quote' then raise exception 'Only quotes can be accepted online.'; end if;
  if d.status in ('accepted', 'declined') then raise exception 'This has already been answered.'; end if;
  if d.status = 'draft' then raise exception 'This document is not ready yet.'; end if;
  if d.valid_until is not null and d.valid_until < current_date then raise exception 'This quote has expired. Please ask for an updated one.'; end if;
  need_sig := coalesce((l.snapshot ->> 'requireSignature')::boolean, true);
  if p_accept and (coalesce(trim(p_name), '') = '' or (need_sig and coalesce(p_signature, '') = '')) then
    raise exception 'Please type your name and sign to accept.';
  end if;
  if length(coalesce(p_signature, '')) > 400000 then raise exception 'Signature image is too large.'; end if;
  update public.sales_documents set
    status = case when p_accept then 'accepted' else 'declined' end,
    responded_at = now(),
    signer_name = left(nullif(trim(coalesce(p_name, '')), ''), 120),
    signature = case when p_accept then nullif(p_signature, '') end,
    client_note = left(nullif(trim(coalesce(p_note, '')), ''), 4000),
    viewed_at = coalesce(viewed_at, now()),
    updated_at = now()
  where id = d.id returning * into d;
  update public.document_links set responded_at = now() where id = p_token returning * into l;
  return public.document_public(l, d);
end $$;

-- ---------- grants ----------
revoke all on function public.billing_owner(text) from public, anon;
revoke all on function public.my_billing_owner() from public, anon;
revoke all on function public.document_number_format(uuid, text) from public, anon, authenticated;
revoke all on function public.take_document_number(text, text, date) from public, anon;
-- The row guard runs as the person saving the row, so they need it; it checks the job is theirs.
grant execute on function public.take_document_number(text, text, date) to authenticated, service_role;
revoke all on function public.issue_document(text) from public, anon;
revoke all on function public.document_numbering() from public, anon;
revoke all on function public.set_document_next_number(text, integer) from public, anon;
revoke all on function public.document_public(public.document_links, public.sales_documents) from public, anon, authenticated;
revoke all on function public.get_document(text) from public;
revoke all on function public.respond_document(text, boolean, text, text, text) from public;
grant execute on function public.billing_owner(text) to authenticated, service_role;
grant execute on function public.my_billing_owner() to authenticated, service_role;
grant execute on function public.format_document_number(text, integer, date) to authenticated, service_role;
grant execute on function public.issue_document(text) to authenticated;
grant execute on function public.document_numbering() to authenticated;
grant execute on function public.set_document_next_number(text, integer) to authenticated;
grant execute on function public.get_document(text) to anon, authenticated;
grant execute on function public.respond_document(text, boolean, text, text, text) to anon, authenticated;

revoke all on public.document_counters from anon, authenticated;
revoke all on public.sales_documents, public.sales_document_payments, public.document_settings, public.document_links from anon;
grant select, insert, update, delete on public.sales_documents, public.sales_document_payments, public.document_links to authenticated;
grant select, insert, update on public.document_settings to authenticated;

notify pgrst, 'reload schema';
