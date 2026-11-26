-- Audit hardening. Safe to run more than once.
--   1. Price tables are read-only for a lapsed company, like the catalog they belong to (company_write_guard on
--      device_type_prices and product_prices, the same trigger device_types and products have).
--   2. respond_proposal keeps only the client's picks that are optional lines of that proposal (each once, at most
--      500): chosen_options can't be filled with made-up keys.
--   3. Change order (/co) and RFI (/q) links expire: share_expires_at, set here whenever a link is shared or sent again
--      (one year from then), whichever app or app version made the link. The server routes treat an expired link as
--      unknown. Links shared before this get a year from now (or from when they were sent, if that is later).
--   4. Company preferences: a section with no usable time (null, infinity) is ignored, and one dated more than 5 minutes
--      ahead of the server clock is dated now, so a device with its clock far ahead can't lock a section. A section
--      already stored with such a time no longer outranks a real one.
--   5. billdu_send_claims: one "Send to Billdu" at a time per job and document type, and the Billdu document it made,
--      so a double click, a retry after a lost answer or a second device updates that document instead of making
--      another. Server only (service role): RLS on, no policies, nothing granted to the apps.

-- ---------- 1. lapsed company: price tables are read-only ----------
-- Same loop as 20261125001000_access_guards.sql section 3 (trigger name, timing and events).
do $$
declare t text;
begin
  foreach t in array array['device_type_prices', 'product_prices'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_company_write_guard', t);
      execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.company_write_guard()',
                     t || '_company_write_guard', t);
    end if;
  end loop;
end $$;

-- ---------- 2. respond_proposal: only real optional lines ----------
-- Same as 20261125001000_access_guards.sql, except that the chosen options are rebuilt from the snapshot: the keys of
-- its optional lines that the client picked (strings only), each once, in the client's order, at most 500.
create or replace function public.respond_proposal(p_token text, p_accept boolean, p_name text, p_signature text, p_options jsonb, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.proposals;
  line jsonb;
  lines jsonb;
  subtotal double precision := 0;
  tax double precision;
  opts jsonb := coalesce(p_options, '[]'::jsonb);
  sig text := nullif(p_signature, '');
begin
  select * into r from public.proposals where id = p_token for update;
  if not found or r.status = 'revoked' then raise exception 'This proposal is no longer available.'; end if;
  if r.status in ('accepted', 'declined') then raise exception 'This proposal has already been answered.'; end if;
  if r.valid_until is not null and r.valid_until < current_date then raise exception 'This proposal has expired. Please ask for an updated one.'; end if;
  if p_accept and (coalesce(trim(p_name), '') = '' or sig is null) then
    raise exception 'Please type your name and sign to accept.';
  end if;
  if length(coalesce(sig, '')) > 400000 then raise exception 'Signature image is too large.'; end if;
  if sig is not null and sig !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'The signature must be a PNG image.';
  end if;
  if jsonb_typeof(opts) <> 'array' then opts := '[]'::jsonb; end if;
  lines := case when jsonb_typeof(r.snapshot -> 'lines') = 'array' then r.snapshot -> 'lines' else '[]'::jsonb end;

  select coalesce(jsonb_agg(to_jsonb(x.k) order by x.first), '[]'::jsonb) into opts
  from (
    select e.v #>> '{}' as k, min(e.ord) as first
    from jsonb_array_elements(opts) with ordinality as e(v, ord)
    where jsonb_typeof(e.v) = 'string'
      and (e.v #>> '{}') in (
        select l ->> 'key' from jsonb_array_elements(lines) as l
        where jsonb_typeof(l) = 'object' and jsonb_typeof(l -> 'key') = 'string' and coalesce((l ->> 'optional')::boolean, false))
    group by 1
    order by 2
    limit 500
  ) x;

  for line in select * from jsonb_array_elements(lines) loop
    if not coalesce((line ->> 'optional')::boolean, false) or opts ? (line ->> 'key') then
      subtotal := subtotal + coalesce((line ->> 'total')::double precision, 0);
    end if;
  end loop;
  tax := round((subtotal * coalesce((r.snapshot ->> 'taxPct')::double precision, 0) / 100)::numeric, 2);

  update public.proposals set
    status = case when p_accept then 'accepted' else 'declined' end,
    responded_at = now(), updated_at = now(),
    client_name = left(nullif(trim(coalesce(p_name, '')), ''), 120),
    signature = case when p_accept then sig end,
    chosen_options = case when p_accept then opts end,
    accepted_total = case when p_accept then round((subtotal + tax)::numeric, 2) end,
    client_note = left(nullif(trim(coalesce(p_note, '')), ''), 4000)
  where id = p_token;
  return public.get_proposal(p_token);
end $$;
revoke all on function public.respond_proposal(text, boolean, text, text, jsonb, text) from public;
grant execute on function public.respond_proposal(text, boolean, text, text, jsonb, text) to anon, authenticated;

-- ---------- 3. change order and RFI links expire ----------
alter table public.change_orders add column if not exists share_expires_at timestamptz;
alter table public.rfis add column if not exists share_expires_at timestamptz;

-- Links already out: a year from now, or from when they were sent if that is later (nothing sent in the last year
-- expires within a year). Only rows without an expiry, so running this again changes nothing.
update public.change_orders set share_expires_at = greatest(now(), coalesce(sent_at, updated_at, created_at, now())) + interval '1 year'
  where share_token is not null and share_expires_at is null;
update public.rfis set share_expires_at = greatest(now(), coalesce(sent_at, updated_at, created_at, now())) + interval '1 year'
  where share_token is not null and share_expires_at is null;

-- The apps (and their older versions, and the iPad) write share_token and sent_at with the rest of the row. The expiry
-- is the database's: a new or changed token, or a newer sent_at (sent again), starts a year; otherwise the stored
-- expiry stays, whatever an app sends. The server (service role) may set it explicitly. Named "…_share_expiry" so it
-- runs after change_orders_guard / rfis_keep_answer, which can put an older token back.
create or replace function public.share_link_expiry() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and current_user not in ('authenticated', 'anon')
     and new.share_expires_at is distinct from old.share_expires_at then
    return new;
  end if;
  if new.share_token is null then
    new.share_expires_at := case when tg_op = 'UPDATE' then old.share_expires_at end;
    return new;
  end if;
  if tg_op = 'INSERT' or new.share_token is distinct from old.share_token or old.share_expires_at is null
     or (new.sent_at is not null and (old.sent_at is null or new.sent_at > old.sent_at)) then
    new.share_expires_at := now() + interval '1 year';
  else
    new.share_expires_at := old.share_expires_at;
  end if;
  return new;
end $$;
revoke all on function public.share_link_expiry() from public, anon, authenticated;

drop trigger if exists change_orders_share_expiry on public.change_orders;
create trigger change_orders_share_expiry before insert or update on public.change_orders
  for each row execute function public.share_link_expiry();
drop trigger if exists rfis_share_expiry on public.rfis;
create trigger rfis_share_expiry before insert or update on public.rfis
  for each row execute function public.share_link_expiry();

-- ---------- 4. company preferences: no section dated in the future ----------
-- Same as 20261125004000_company_preferences.sql, plus: a section without a finite time is ignored; one dated more
-- than 5 minutes ahead is dated now (its updatedAt rewritten); a stored section dated like that (from before this)
-- doesn't outrank an incoming one. Stable, not immutable: it reads the clock.
create or replace function public.merge_preferences(old jsonb, new jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  result jsonb := case when jsonb_typeof(old) = 'object' then old else '{}'::jsonb end;
  k text;
  v jsonb;
  at timestamptz;
  prev timestamptz;
  horizon timestamptz := now() + interval '5 minutes';
begin
  if new is null or jsonb_typeof(new) <> 'object' then return result; end if;
  for k, v in select * from jsonb_each(new) loop
    at := public.preference_section_at(v);
    continue when at is null or not isfinite(at) or length(k) > 60;
    v := jsonb_build_object('value', v -> 'value', 'updatedAt', v -> 'updatedAt');
    if at > horizon then
      at := now();
      v := jsonb_set(v, '{updatedAt}', to_jsonb(to_char(at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    end if;
    prev := public.preference_section_at(result -> k);
    if prev is not null and (not isfinite(prev) or prev > horizon) then prev := null; end if;
    if prev is null or at > prev then
      result := result || jsonb_build_object(k, v);
    end if;
  end loop;
  return result;
end $$;
revoke all on function public.merge_preferences(jsonb, jsonb) from public;
grant execute on function public.merge_preferences(jsonb, jsonb) to authenticated, service_role;

-- ---------- 5. Billdu: one send at a time, and the document it made ----------
-- owner_id: the company (team id) or the person working alone (user id), as the Billdu connection is keyed.
-- doc_type: estimate, order or invoice; with "_deposit" for a deposit document (a new document each time: its claim
-- only keeps two sends from running at once, and is let go when the send is done).
create table if not exists public.billdu_send_claims (
  owner_id uuid not null,
  project_id text not null check (char_length(project_id) between 1 and 200),
  doc_type text not null check (doc_type ~ '^(estimate|order|invoice)(_deposit)?$'),
  started_at timestamptz not null default now(),
  billdu_doc_id bigint,
  primary key (owner_id, project_id, doc_type)
);
alter table public.billdu_send_claims enable row level security;
revoke all on public.billdu_send_claims from public, anon, authenticated;
grant select, insert, update, delete on public.billdu_send_claims to service_role;

-- Take the claim for one send: {ok: true, billdu_doc_id, started_at} when this send may go ahead (no claim, a claim that already
-- has its document, or one older than 2 minutes: that send died), {ok: false} while another send of the same document
-- is under way. One statement, so two sends at once can't both take a fresh claim.
create or replace function public.billdu_send_claim(p_owner uuid, p_project text, p_doc_type text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.billdu_send_claims;
begin
  insert into public.billdu_send_claims as b (owner_id, project_id, doc_type) values (p_owner, p_project, p_doc_type)
    on conflict (owner_id, project_id, doc_type) do update set started_at = now()
    where b.billdu_doc_id is not null or b.started_at < now() - interval '2 minutes'
    returning * into c;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'billdu_doc_id', c.billdu_doc_id, 'started_at', c.started_at);
end $$;
revoke all on function public.billdu_send_claim(uuid, text, text) from public, anon, authenticated;
grant execute on function public.billdu_send_claim(uuid, text, text) to service_role;

-- ---------- schema version ----------
create or replace function public.schema_version() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v text := '20261126001000_audit_hardening';
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
