-- Execute depois de criar admin01@axionsolutions.com.br em Authentication > Users.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) ||
      '{"role":"admin","status":"approved"}'::jsonb,
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
      '{"display_name":"Administrador","username":"Admin01","profile":"orteconte"}'::jsonb
where lower(email) = 'admin01@axionsolutions.com.br';
