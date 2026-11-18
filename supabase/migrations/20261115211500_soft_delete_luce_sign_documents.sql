alter table public.sign_documents
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

create index if not exists sign_documents_visible_idx
  on public.sign_documents (organization_id, created_at desc)
  where deleted_at is null;

create or replace function public.sign_hide_document(
  p_document_id uuid, p_actor_id uuid
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_document public.sign_documents%rowtype;
begin
  select * into v_document from public.sign_documents
    where id = p_document_id and deleted_at is null for update;
  if not found then return false; end if;

  if v_document.status in ('draft', 'prepared', 'sent', 'viewed', 'partially_signed') then
    update public.sign_signers set link_hash = null, link_nonce = null,
      otp_hash = null, session_hash = null, session_expires_at = null, updated_at = now()
      where document_id = p_document_id;
  end if;

  update public.sign_documents set
    status = case when status in ('draft', 'prepared', 'sent', 'viewed', 'partially_signed')
      then 'cancelled' else status end,
    deleted_at = now(), deleted_by = p_actor_id, updated_at = now(), updated_by = p_actor_id
    where id = p_document_id;
  insert into public.sign_events(document_id, organization_id, actor_id, event_type)
    values (p_document_id, v_document.organization_id, p_actor_id, 'document.deleted');
  return true;
end;
$$;

revoke all on function public.sign_hide_document(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.sign_hide_document(uuid, uuid)
  to service_role;
