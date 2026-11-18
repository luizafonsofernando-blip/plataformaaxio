do $$
declare
  v_user_id uuid;
  v_organization_id uuid;
  v_modules jsonb;
begin
  select id, coalesce(raw_app_meta_data->'allowed_modules', '[]'::jsonb)
    into v_user_id, v_modules
  from auth.users
  where lower(email) = 'luizafonsofernando@gmail.com'
    and lower(raw_user_meta_data->>'username') = 'admin01'
    and raw_app_meta_data->>'role' = 'admin'
  limit 1;

  if v_user_id is null then
    raise exception 'Admin01 não encontrado; nenhum acesso do LUCE Sign foi alterado';
  end if;

  if jsonb_typeof(v_modules) <> 'array' then
    raise exception 'Lista de módulos do Admin01 inválida';
  end if;

  if not (v_modules ? 'luce-sign') then
    update auth.users
    set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{allowed_modules}',
      v_modules || '["luce-sign"]'::jsonb, true),
      updated_at = now()
    where id = v_user_id;
  end if;

  select id into v_organization_id
  from public.sign_organizations
  where created_by = v_user_id and name = 'Luce Sistemas'
  order by created_at limit 1;

  if v_organization_id is null then
    insert into public.sign_organizations (name, created_by)
    values ('Luce Sistemas', v_user_id)
    returning id into v_organization_id;
  end if;

  insert into public.sign_members (organization_id, user_id, role)
  values (v_organization_id, v_user_id, 'admin')
  on conflict (organization_id, user_id) do update set role = 'admin';
end
$$;
