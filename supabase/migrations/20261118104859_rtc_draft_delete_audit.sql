-- Deletion remains server-only; the trigger preserves an audit record atomically.
create function public.rtc_audit_simulation_draft_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.rtc_audit_events(organization_id, actor_id, event_type, details)
  values(old.organization_id, old.created_by, 'simulation_draft_deleted',
    jsonb_build_object('draft_id', old.id, 'company_id', old.company_id,
      'version', old.version));
  return old;
end;
$$;
revoke all on function public.rtc_audit_simulation_draft_delete() from public, anon, authenticated;
create trigger rtc_simulation_drafts_delete_audit
  before delete on public.rtc_simulation_drafts
  for each row execute function public.rtc_audit_simulation_draft_delete();

grant delete on public.rtc_simulation_drafts to service_role;
