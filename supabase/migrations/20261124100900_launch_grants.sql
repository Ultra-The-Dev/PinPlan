-- Launch grants: functions added by the launch migrations default to EXECUTE for PUBLIC. Signed-out callers only need
-- the link pages, the invite lookup and schema_version (the health check reads it with the anon key). Safe to rerun.
revoke execute on function public.billing_enforced() from public, anon;
grant execute on function public.billing_enforced() to authenticated, service_role;
revoke execute on function public.teams_trial_policy() from public, anon, authenticated;

notify pgrst, 'reload schema';
