create or replace function public.sign_verify_portal_account(
  p_signer_id uuid, p_session_hash text, p_account_id uuid,
  p_ip_address inet, p_user_agent text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_signer public.sign_signers%rowtype;
begin
  select * into v_signer from public.sign_signers where id = p_signer_id;
  if not found then return false; end if;
  perform 1 from public.sign_documents where id = v_signer.document_id for update;
  select * into v_signer from public.sign_signers where id = p_signer_id for update;
  if v_signer.status not in ('invited', 'authenticated', 'viewed', 'signed')
    or v_signer.link_expires_at is null or v_signer.link_expires_at <= now()
    or p_session_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  update public.sign_signers set session_hash = p_session_hash,
    session_expires_at = now() + interval '30 minutes',
    status = case when status = 'signed' then 'signed' else 'authenticated' end,
    updated_at = now() where id = p_signer_id;
  insert into public.sign_events
    (document_id, organization_id, signer_id, event_type, details, ip_address, user_agent)
    values (v_signer.document_id, v_signer.organization_id, p_signer_id,
      'account.authenticated', jsonb_build_object('account_id', p_account_id,
      'method', 'confirmed_portal_account'), p_ip_address, left(p_user_agent, 500));
  return true;
end;
$$;

revoke all on function public.sign_verify_portal_account(uuid, text, uuid, inet, text)
  from public, anon, authenticated;
grant execute on function public.sign_verify_portal_account(uuid, text, uuid, inet, text)
  to service_role;

create or replace function public.sign_decline_document(
  p_signer_id uuid, p_session_hash text, p_ip_address inet, p_user_agent text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_signer public.sign_signers%rowtype; v_status text;
begin
  select * into v_signer from public.sign_signers where id = p_signer_id;
  if not found then return false; end if;
  select status into v_status from public.sign_documents where id = v_signer.document_id for update;
  select * into v_signer from public.sign_signers where id = p_signer_id for update;
  if v_status not in ('sent', 'viewed', 'partially_signed')
    or v_signer.status not in ('authenticated', 'viewed')
    or v_signer.session_hash is distinct from p_session_hash
    or v_signer.session_expires_at <= now() then return false; end if;
  update public.sign_signers set status = 'declined', session_hash = null,
    session_expires_at = null, updated_at = now() where id = p_signer_id;
  update public.sign_documents set status = 'declined', updated_at = now()
    where id = v_signer.document_id;
  insert into public.sign_events
    (document_id, organization_id, signer_id, event_type, ip_address, user_agent)
    values (v_signer.document_id, v_signer.organization_id, p_signer_id,
      'signer.declined', p_ip_address, left(p_user_agent, 500));
  return true;
end;
$$;
revoke all on function public.sign_decline_document(uuid, text, inet, text)
  from public, anon, authenticated;
grant execute on function public.sign_decline_document(uuid, text, inet, text)
  to service_role;

create or replace function public.sign_cancel_document(
  p_document_id uuid, p_actor_id uuid
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.sign_documents
    where id = p_document_id and status in ('draft', 'prepared', 'sent', 'viewed', 'partially_signed') for update;
  if not found then return false; end if;
  update public.sign_documents set status = 'cancelled', updated_at = now(), updated_by = p_actor_id
    where id = p_document_id;
  update public.sign_signers set link_hash = null, link_nonce = null,
    otp_hash = null, session_hash = null, session_expires_at = null, updated_at = now()
    where document_id = p_document_id;
  insert into public.sign_events(document_id, organization_id, actor_id, event_type)
    values (p_document_id, v_org, p_actor_id, 'document.cancelled');
  return true;
end;
$$;
revoke all on function public.sign_cancel_document(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.sign_cancel_document(uuid, uuid)
  to service_role;
