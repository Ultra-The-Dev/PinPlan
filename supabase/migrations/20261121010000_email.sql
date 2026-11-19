-- Email notifications. Safe to run more than once.
-- When a client answers a proposal or plan review, the server emails the installer once and stamps this column, so a
-- repeated call from the client page doesn't send again. Only the server (service role) sets it.
alter table public.proposals add column if not exists response_notified_at timestamptz;

-- Clients answer through respond_proposal (security definer), and the installer's own updates go through RLS:
-- keep the stamp out of their hands so nobody can suppress (or re-arm) the notification.
create or replace function public.proposals_notify_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  -- session_user: the role that logged in (the API connects as "authenticator"; the SQL editor as postgres).
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    new.response_notified_at := old.response_notified_at;
  end if;
  return new;
end $$;
drop trigger if exists proposals_notify_guard on public.proposals;
create trigger proposals_notify_guard before update on public.proposals
  for each row execute function public.proposals_notify_guard();

notify pgrst, 'reload schema';
