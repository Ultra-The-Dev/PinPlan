-- Safe to run more than once.
-- Client proposals: a frozen copy of the estimate (with marked-up plans) behind an unguessable link.
-- Clients have no account: they read and answer a proposal only through the two functions below, by its token.

create table if not exists public.proposals (
  -- The link token (random, 24+ chars). Knowing it is what lets a client open the proposal.
  id text primary key check (length(id) >= 20),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null,
  -- Everything the client page shows (business, client, scope, plan images, lines, terms). Never changes after publishing.
  snapshot jsonb not null,
  status text not null default 'sent' check (status in ('sent', 'viewed', 'accepted', 'declined', 'revoked')),
  valid_until date,
  viewed_at timestamptz,
  responded_at timestamptz,
  -- Answer from the client.
  client_name text,
  signature text,
  chosen_options jsonb,
  accepted_total double precision,
  client_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proposals_project_idx on public.proposals (project_id);

alter table public.proposals enable row level security;
-- The installer (and team members on the job) manage proposals; clients never touch the table directly.
drop policy if exists proposals_team on public.proposals;
create policy proposals_team on public.proposals for all
  using (owner_id = auth.uid() or public.is_project_member(project_id))
  with check (owner_id = auth.uid());

-- Client side: open a proposal by its token. Marks it viewed the first time. Returns null for unknown or revoked links.
create or replace function public.get_proposal(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.proposals;
begin
  select * into r from public.proposals where id = p_token;
  if not found or r.status = 'revoked' then return null; end if;
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

-- Client side: accept (with name + signature + chosen optional lines) or decline. Only once, and not after it expires.
-- The total is worked out here from the frozen lines, so the page can't change the price.
create or replace function public.respond_proposal(p_token text, p_accept boolean, p_name text, p_signature text, p_options jsonb, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.proposals;
  line jsonb;
  subtotal double precision := 0;
  tax double precision;
  opts jsonb := coalesce(p_options, '[]'::jsonb);
begin
  select * into r from public.proposals where id = p_token for update;
  if not found or r.status = 'revoked' then raise exception 'This proposal is no longer available.'; end if;
  if r.status in ('accepted', 'declined') then raise exception 'This proposal has already been answered.'; end if;
  if r.valid_until is not null and r.valid_until < current_date then raise exception 'This proposal has expired. Please ask for an updated one.'; end if;
  if p_accept and (coalesce(trim(p_name), '') = '' or coalesce(p_signature, '') = '') then
    raise exception 'Please type your name and sign to accept.';
  end if;
  if length(coalesce(p_signature, '')) > 400000 then raise exception 'Signature image is too large.'; end if;

  for line in select * from jsonb_array_elements(r.snapshot -> 'lines') loop
    if not coalesce((line ->> 'optional')::boolean, false) or opts ? (line ->> 'key') then
      subtotal := subtotal + coalesce((line ->> 'total')::double precision, 0);
    end if;
  end loop;
  tax := round((subtotal * coalesce((r.snapshot ->> 'taxPct')::double precision, 0) / 100)::numeric, 2);

  update public.proposals set
    status = case when p_accept then 'accepted' else 'declined' end,
    responded_at = now(), updated_at = now(),
    client_name = nullif(trim(coalesce(p_name, '')), ''),
    signature = case when p_accept then p_signature end,
    chosen_options = case when p_accept then opts end,
    accepted_total = case when p_accept then round((subtotal + tax)::numeric, 2) end,
    client_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_token;
  return public.get_proposal(p_token);
end $$;

revoke all on function public.get_proposal(text) from public;
revoke all on function public.respond_proposal(text, boolean, text, text, jsonb, text) from public;
grant execute on function public.get_proposal(text) to anon, authenticated;
grant execute on function public.respond_proposal(text, boolean, text, text, jsonb, text) to anon, authenticated;

-- Plan images for proposals: public read (paths contain the link token), only the installer can upload under their own folder.
insert into storage.buckets (id, name, public) values ('proposals', 'proposals', true) on conflict (id) do nothing;
drop policy if exists proposals_files_insert on storage.objects;
create policy proposals_files_insert on storage.objects for insert
  with check (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists proposals_files_update on storage.objects;
create policy proposals_files_update on storage.objects for update
  using (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists proposals_files_delete on storage.objects;
create policy proposals_files_delete on storage.objects for delete
  using (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists proposals_files_read on storage.objects;
create policy proposals_files_read on storage.objects for select
  using (bucket_id = 'proposals');

-- Make the new table and functions visible to the API right away.
notify pgrst, 'reload schema';
