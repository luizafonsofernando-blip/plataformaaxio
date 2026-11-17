-- Preserve each active user's legacy module while granting access to Luce Contratos.
-- Suspended, unconfirmed and deleted accounts are intentionally left unchanged.
with eligible_users as (
  select
    id,
    case lower(coalesce(raw_user_meta_data ->> 'profile', ''))
      when 'property' then 'property'
      when 'cerne' then 'cerne'
      when 'sentinela' then 'sentinela'
      when 'contratos' then 'contratos'
      when 'radar-legislativo' then 'radar-legislativo'
      when 'radar-sindical' then 'radar-legislativo'
      when 'comunicados' then 'comunicados'
      when 'comunica-facil' then 'comunicados'
      when 'review-folha' then 'review-folha'
      else 'onboarding'
    end as legacy_module
  from auth.users
  where deleted_at is null
    and email_confirmed_at is not null
    and coalesce(raw_app_meta_data ->> 'status', 'approved') = 'approved'
)
update auth.users as users
set raw_app_meta_data = jsonb_set(
  coalesce(users.raw_app_meta_data, '{}'::jsonb),
  '{allowed_modules}',
  (
    select jsonb_agg(module_id order by module_id)
    from (
      select distinct module_id
      from (
        select jsonb_array_elements_text(
          case
            when jsonb_typeof(users.raw_app_meta_data -> 'allowed_modules') = 'array'
              then users.raw_app_meta_data -> 'allowed_modules'
            else '[]'::jsonb
          end
        ) as module_id
        union all
        select eligible_users.legacy_module
        union all
        select 'contratos'
      ) as combined_modules
      where module_id in (
        'onboarding',
        'property',
        'cerne',
        'comunicados',
        'review-folha',
        'sentinela',
        'radar-legislativo',
        'contratos'
      )
    ) as normalized_modules
  ),
  true
)
from eligible_users
where users.id = eligible_users.id
  and not coalesce(users.raw_app_meta_data -> 'allowed_modules', '[]'::jsonb) @> '["contratos"]'::jsonb;
