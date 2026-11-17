-- Grant the root Luce administrator explicit access to the Sentinela module.
do $$
declare
  v_user_id uuid;
  v_organization_id uuid;
  v_allowed_modules jsonb;
begin
  select id
    into v_user_id
  from auth.users
  where lower(email) = 'luizafonsofernando@gmail.com'
     or lower(coalesce(raw_user_meta_data ->> 'username', '')) = 'admin01'
  order by case when lower(email) = 'luizafonsofernando@gmail.com' then 0 else 1 end
  limit 1;

  if v_user_id is null then
    raise exception 'ADMIN 01 não localizado; nenhuma permissão foi alterada.';
  end if;

  select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
    into v_allowed_modules
  from (
    select distinct value
    from jsonb_array_elements_text(
      coalesce((select raw_app_meta_data -> 'allowed_modules' from auth.users where id = v_user_id), '[]'::jsonb)
      || '["sentinela"]'::jsonb
    ) as module(value)
  ) modules;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'role', 'admin',
      'status', 'approved',
      'allowed_modules', v_allowed_modules
    ),
    updated_at = now()
  where id = v_user_id;

  insert into public.sentinel_organizations (name, slug, status)
  values ('Luce Sistemas', 'luce-sistemas', 'active')
  on conflict (slug) do update
    set status = 'active', updated_at = now()
  returning id into v_organization_id;

  insert into public.sentinel_memberships (organization_id, user_id, role, status)
  values (v_organization_id, v_user_id, 'admin', 'active')
  on conflict (organization_id, user_id) do update
    set role = 'admin', status = 'active', updated_at = now();

  insert into public.sentinel_audit_events (
    organization_id,
    actor_id,
    event_type,
    entity_type,
    entity_id,
    after_data,
    metadata
  ) values (
    v_organization_id,
    v_user_id,
    'module_access_granted',
    'membership',
    v_user_id::text,
    jsonb_build_object('role', 'admin', 'status', 'active', 'module', 'sentinela'),
    jsonb_build_object('source', 'versioned_migration')
  );
end
$$;
