-- Execute depois de criar a conta fernanddo46@axionsolutions.com.br em Authentication > Users.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb,
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
      '{"display_name":"Luiz Fernando","username":"fernanddo46","profile":"orteconte"}'::jsonb
where lower(email) = 'fernanddo46@axionsolutions.com.br';
