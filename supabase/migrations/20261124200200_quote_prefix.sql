-- Quotes are called "Quote" everywhere now (docs/ux-audit.md), and the app's default quote number is Q-{0000}. The
-- database fallback (used when a company never saved its own quote format) still said EST-{0000}: a company that hadn't
-- opened Settings → Invoicing got quotes numbered EST-0001 while the app showed Q-…. Same function, new fallback.
-- A format a company saved itself (including an explicit EST-{0000}) is kept as it is.
create or replace function public.document_number_format(p_owner uuid, p_kind text) returns table (fmt text, yearly boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(c ->> 'format', ''), d.fmt),
         coalesce((c ->> 'yearlyReset')::boolean, d.yearly)
  from (select case p_kind when 'invoice' then 'INV-{YYYY}-{0000}' when 'credit_note' then 'CN-{0000}' else 'Q-{0000}' end as fmt,
               p_kind = 'invoice' as yearly) d
  left join lateral (select s.config -> 'kinds' -> p_kind as c from public.document_settings s where s.owner_id = p_owner) x on true;
$$;

revoke all on function public.document_number_format(uuid, text) from public, anon, authenticated;
