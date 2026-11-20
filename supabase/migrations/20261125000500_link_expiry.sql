-- Safe to run more than once.
-- Client links stop working after a while.
--   * photo_reports.expires_at / document_links.expires_at: when the link stops opening (null: no end date). New photo
--     reports get one year by default; quote / invoice links have none unless the office sets one (an invoice's pay
--     link has to keep working until it is paid).
--   * get_photo_report and get_document return nothing once the link has expired, and an expired document link can't
--     be answered any more.
--   * get_proposal stops returning the proposal (prices, plans, client details) 30 days after it was valid until. The
--     page is then told only that it expired, and by whom it was sent.

alter table public.photo_reports add column if not exists expires_at timestamptz;
alter table public.photo_reports alter column expires_at set default (now() + interval '1 year');
alter table public.document_links add column if not exists expires_at timestamptz;

-- ---------- photo reports ----------
create or replace function public.get_photo_report(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when r.revoked or (r.expires_at is not null and r.expires_at <= now()) then null
              else jsonb_build_object('snapshot', r.snapshot, 'createdAt', r.created_at) end
  from public.photo_reports r where r.id = p_token
$$;
revoke all on function public.get_photo_report(text) from public;
grant execute on function public.get_photo_report(text) to anon, authenticated;

-- ---------- quote / invoice links ----------
-- Opens a document by its link. Marks it viewed. Null for unknown, withdrawn, expired or deleted links.
create or replace function public.get_document(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.document_links; d public.sales_documents;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into l from public.document_links where id = p_token;
  if not found or l.status = 'revoked' then return null; end if;
  if l.expires_at is not null and l.expires_at <= now() then return null; end if;
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
revoke all on function public.get_document(text) from public;
grant execute on function public.get_document(text) to anon, authenticated;

-- respond_document stamps the link it was answered through; an expired link refuses that stamp, so the whole answer is
-- rolled back. (A trigger, so it holds whichever version of respond_document is installed.)
create or replace function public.document_links_expiry_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.responded_at is distinct from old.responded_at and new.responded_at is not null
     and old.expires_at is not null and old.expires_at <= now() then
    raise exception 'This link has expired. Please ask for an updated one.';
  end if;
  return new;
end $$;
drop trigger if exists document_links_expiry_guard on public.document_links;
create trigger document_links_expiry_guard before update on public.document_links
  for each row execute function public.document_links_expiry_guard();
revoke all on function public.document_links_expiry_guard() from public, anon;

-- ---------- proposals ----------
-- Client side: open a proposal by its token. Marks it viewed the first time. Returns null for unknown or revoked links.
-- 30 days after valid_until only {status: 'expired', expired: true, validUntil, business: {name}} comes back.
create or replace function public.get_proposal(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.proposals;
begin
  select * into r from public.proposals where id = p_token;
  if not found or r.status = 'revoked' then return null; end if;
  if r.valid_until is not null and r.valid_until + 30 < current_date then
    return jsonb_build_object(
      'status', 'expired', 'expired', true, 'validUntil', r.valid_until,
      'business', jsonb_build_object('name', coalesce(r.snapshot -> 'business' ->> 'name', ''))
    );
  end if;
  if r.status = 'sent' then
    update public.proposals set status = 'viewed', viewed_at = now(), updated_at = now() where id = p_token;
    r.status := 'viewed';
  end if;
  return jsonb_build_object(
    'snapshot', r.snapshot, 'status', r.status, 'validUntil', r.valid_until, 'respondedAt', r.responded_at,
    'clientName', r.client_name, 'chosenOptions', coalesce(r.chosen_options, '[]'::jsonb), 'acceptedTotal', r.accepted_total,
    'expired', r.valid_until is not null and r.valid_until < current_date
  );
end $$;
revoke all on function public.get_proposal(text) from public;
grant execute on function public.get_proposal(text) to anon, authenticated;

notify pgrst, 'reload schema';
