-- Atomic, audited queue review. Browser clients cannot update queue rows directly.

revoke update on public.cerne_onboarding_queue from authenticated;

create or replace function public.review_cerne_onboarding(
  p_queue_id uuid,
  p_decision text,
  p_client jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_queue public.cerne_onboarding_queue%rowtype;
  v_client_id uuid;
  v_cnpj text;
  v_company text;
begin
  if v_actor is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_decision not in ('accepted', 'rejected') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  select * into v_queue
  from public.cerne_onboarding_queue
  where id = p_queue_id
  for update;

  if not found then
    raise exception 'queue_item_not_found' using errcode = 'P0002';
  end if;

  if v_queue.owner_id <> v_actor and not public.is_luce_admin() then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if v_queue.status <> 'pending' then
    raise exception 'queue_item_already_reviewed' using errcode = '23505';
  end if;

  if p_decision = 'accepted' then
    v_cnpj := regexp_replace(
      coalesce(p_client ->> 'cnpj', v_queue.payload ->> 'documento', ''),
      '[^0-9]', '', 'g'
    );
    v_company := trim(coalesce(p_client ->> 'company', v_queue.payload ->> 'empresa', ''));

    if length(v_cnpj) <> 14 or char_length(v_company) < 2 then
      raise exception 'client_data_incomplete' using errcode = '22023';
    end if;

    if v_queue.event_type = 'entry' then
      insert into public.cerne_clients (
        owner_id, created_by, company, cnpj, city, state, tax_regime, segment,
        unit, consultant, channel, monthly_fee, employees, entry_date, source_document_id
      ) values (
        v_queue.owner_id,
        v_actor,
        v_company,
        v_cnpj,
        nullif(p_client ->> 'city',''),
        nullif(upper(p_client ->> 'state'),''),
        nullif(p_client ->> 'tax_regime',''),
        nullif(p_client ->> 'segment',''),
        nullif(p_client ->> 'unit',''),
        nullif(p_client ->> 'consultant',''),
        coalesce(nullif(p_client ->> 'channel',''),'Onboarding'),
        greatest(coalesce((p_client ->> 'monthly_fee')::numeric,0),0),
        greatest(coalesce((p_client ->> 'employees')::integer,0),0),
        coalesce((p_client ->> 'entry_date')::date,current_date),
        v_queue.source_document_id
      )
      on conflict (cnpj) do nothing
      returning id into v_client_id;

      if v_client_id is null then
        select id into v_client_id
        from public.cerne_clients
        where cnpj = v_cnpj
          and (owner_id = v_queue.owner_id or public.is_luce_admin());
        if v_client_id is null then
          raise exception 'client_owned_by_another_user' using errcode = '42501';
        end if;
      end if;
    else
      update public.cerne_clients
      set status = 'inactive', updated_at = now()
      where cnpj = v_cnpj
        and (owner_id = v_queue.owner_id or public.is_luce_admin())
      returning id into v_client_id;

      if v_client_id is null then
        raise exception 'client_not_found_for_exit' using errcode = 'P0002';
      end if;
    end if;
  end if;

  update public.cerne_onboarding_queue
  set status = p_decision,
      reviewed_by = v_actor,
      reviewed_at = now(),
      accepted_client_id = v_client_id
  where id = p_queue_id;

  insert into public.security_audit_log(actor_id,event_type,target_id,metadata)
  values (
    v_actor,
    'cerne_onboarding_' || p_decision,
    p_queue_id::text,
    jsonb_build_object(
      'event_type', v_queue.event_type,
      'source_document_id', v_queue.source_document_id,
      'client_id', v_client_id
    )
  );

  return v_client_id;
end;
$$;

revoke all on function public.review_cerne_onboarding(uuid,text,jsonb) from public, anon;
grant execute on function public.review_cerne_onboarding(uuid,text,jsonb) to authenticated;
