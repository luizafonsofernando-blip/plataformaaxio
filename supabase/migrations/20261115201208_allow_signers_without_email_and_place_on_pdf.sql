alter table public.sign_signers alter column email drop not null;

create or replace function public.sign_place_signer(
  p_document_id uuid, p_actor_id uuid, p_full_name text,
  p_page_number integer, p_x numeric, p_y numeric, p_width numeric, p_height numeric
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_document public.sign_documents%rowtype;
  v_order integer;
  v_signer_id uuid;
begin
  select * into v_document from public.sign_documents
    where id = p_document_id for update;
  if not found or v_document.status <> 'draft' or v_document.original_path is null
    or length(btrim(p_full_name)) not between 2 and 160
    or p_page_number < 1 or p_page_number > v_document.page_count then
    return null;
  end if;
  select coalesce(max(signing_order), 0) + 1 into v_order
    from public.sign_signers where document_id = p_document_id;
  if v_order > 100 then return null; end if;
  insert into public.sign_signers
    (document_id, organization_id, full_name, email, role, signing_order, created_by)
    values (p_document_id, v_document.organization_id, btrim(p_full_name), null,
      'Signatário', v_order, p_actor_id)
    returning id into v_signer_id;
  insert into public.sign_fields
    (document_id, organization_id, signer_id, page_number, x, y, width, height)
    values (p_document_id, v_document.organization_id, v_signer_id,
      p_page_number, p_x, p_y, p_width, p_height);
  return v_signer_id;
end;
$$;

revoke all on function public.sign_place_signer(uuid, uuid, text, integer, numeric, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.sign_place_signer(uuid, uuid, text, integer, numeric, numeric, numeric, numeric)
  to service_role;
