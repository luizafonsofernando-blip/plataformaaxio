do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('revoke truncate, trigger, references on table %I.%I from authenticated', r.schemaname, r.tablename);
    execute format('revoke truncate, trigger, references on table %I.%I from anon', r.schemaname, r.tablename);
  end loop;
end $$;

revoke all on table public."user" from anon;
revoke all on table public."user" from authenticated;

revoke execute on function public.audit_onboarding_document_change() from public, anon, authenticated;
revoke execute on function public.set_onboarding_document_updated_at() from public, anon, authenticated;
revoke execute on function public.set_property_module_state_updated_at() from public, anon, authenticated;

revoke all on table public.security_audit_log from anon;
revoke insert, update, delete, truncate, trigger, references on table public.security_audit_log from authenticated;
revoke all on table public.auth_rate_limits from anon, authenticated;
