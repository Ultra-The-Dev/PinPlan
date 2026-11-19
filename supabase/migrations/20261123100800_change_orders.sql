-- Change orders: extra (or removed) work on a job, priced from the catalog, approved by the client on a link with a
-- signature. See docs/change-orders.md. Safe to run more than once.
--
-- Money is office work: technicians can't read or write change orders (same rule as estimate_lines and
-- sales_documents). Clients have no account: they read and answer a change order only through the server route
-- /api/change-orders/public, which uses the service role and looks the row up by share_token.

create table if not exists public.change_orders (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  -- 1, 2, 3… per job (CO-001). A revision keeps its number; void ones keep theirs.
  number integer not null default 0,
  title text not null default '',
  reason text not null default 'other' check (reason in ('client_request', 'plan_revision', 'field_condition', 'rfi', 'other')),
  description text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'rejected', 'void')),
  -- ChangeOrderLine[] (src/lib/types.ts): {id, kind, deviceTypeId, description, qty, unit, unitPrice, taxable}.
  lines jsonb not null default '[]'::jsonb,
  markup_pct double precision,
  tax_pct double precision,
  schedule_days double precision,
  -- Soft links (no foreign keys): photos, RFI, sheets and plan devices may sync later.
  photo_ids jsonb,
  rfi_id text,
  sheet_ids jsonb,
  marker_ids jsonb,
  -- The client link token (random, 20+ chars) and what the link shows (frozen when sent: ChangeOrderPublicView).
  share_token text check (share_token is null or length(share_token) >= 20),
  public_view jsonb,
  sent_at timestamptz,
  -- The answer: written by the server from the client link, or by the office for a verbal / paper approval.
  responded_at timestamptz,
  approved_name text,
  signature_image_id text,
  client_comment text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists change_orders_project_idx on public.change_orders (project_id);
create unique index if not exists change_orders_share_token_uniq on public.change_orders (share_token) where share_token is not null;

-- ---------- synced_at trigger + watermark index (like the other synced tables) ----------
drop trigger if exists change_orders_synced_at on public.change_orders;
create trigger change_orders_synced_at before insert or update on public.change_orders
  for each row execute function public.set_synced_at();
create index if not exists change_orders_synced_at_idx on public.change_orders (synced_at);

-- ---------- an approved change order is final; a client's answer can't be overwritten by a stale device ----------
-- Devices push whole rows (last write wins). A tablet that edited a change order offline must not undo the client's
-- signature, so once a change order is approved its content and answer stay as they are (only the server, with the
-- service role, can change them), and a rejected one can only be voided. The kept row is stamped newer than the
-- device's copy, so the device's next pull takes it back.
create or replace function public.change_orders_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user not in ('authenticated', 'anon') then return new; end if;
  if old.status = 'approved' then
    if row(new.status, new.lines, new.markup_pct, new.tax_pct, new.number, new.title, new.responded_at, new.approved_name,
           new.signature_image_id, new.client_comment, new.share_token, new.public_view, new.deleted)
       is distinct from
       row(old.status, old.lines, old.markup_pct, old.tax_pct, old.number, old.title, old.responded_at, old.approved_name,
           old.signature_image_id, old.client_comment, old.share_token, old.public_view, old.deleted) then
      new.status := old.status; new.lines := old.lines; new.markup_pct := old.markup_pct; new.tax_pct := old.tax_pct;
      new.number := old.number; new.title := old.title; new.responded_at := old.responded_at;
      new.approved_name := old.approved_name; new.signature_image_id := old.signature_image_id;
      new.client_comment := old.client_comment; new.share_token := old.share_token; new.public_view := old.public_view;
      new.deleted := old.deleted;
      new.updated_at := greatest(new.updated_at + interval '1 millisecond', now());
    end if;
  elsif old.status = 'rejected' and old.responded_at is not null then
    if new.status not in ('rejected', 'void') or new.responded_at is distinct from old.responded_at
       or new.approved_name is distinct from old.approved_name or new.client_comment is distinct from old.client_comment then
      if new.status not in ('rejected', 'void') then new.status := old.status; end if;
      new.responded_at := old.responded_at; new.approved_name := old.approved_name; new.client_comment := old.client_comment;
      new.updated_at := greatest(new.updated_at + interval '1 millisecond', now());
    end if;
  end if;
  return new;
end $$;
drop trigger if exists change_orders_guard on public.change_orders;
create trigger change_orders_guard before update on public.change_orders
  for each row execute function public.change_orders_guard();

-- ---------- row-level security: office only (no techs), like estimate_lines ----------
alter table public.change_orders enable row level security;
drop policy if exists change_orders_select on public.change_orders;
create policy change_orders_select on public.change_orders for select
  using (public.is_project_member(project_id) and not public.is_tech());
drop policy if exists change_orders_insert on public.change_orders;
create policy change_orders_insert on public.change_orders for insert
  with check (public.is_project_member(project_id) and not public.is_tech());
drop policy if exists change_orders_update on public.change_orders;
create policy change_orders_update on public.change_orders for update
  using (public.is_project_member(project_id) and not public.is_tech())
  with check (public.is_project_member(project_id) and not public.is_tech());
-- No delete policy: deletes are soft (deleted = true), like every synced table.

-- ---------- read-only when the subscription has lapsed (same guard as the other job tables) ----------
drop trigger if exists change_orders_write_guard on public.change_orders;
create trigger change_orders_write_guard before insert or update on public.change_orders
  for each row execute function public.job_write_guard();

revoke all on public.change_orders from anon;
grant select, insert, update on public.change_orders to authenticated;

notify pgrst, 'reload schema';
