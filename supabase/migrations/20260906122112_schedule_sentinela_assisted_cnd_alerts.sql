create extension if not exists pg_cron;

create or replace function private.sentinel_refresh_assisted_cnd_alerts()
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  with latest_cnd as (
    select distinct on (i.organization_id, i.company_id)
      i.id, i.organization_id, i.company_id, i.document_id, i.valid_until,
      c.legal_name,
      floor(extract(epoch from (i.valid_until - now())) / 86400)::integer as days_left
    from public.sentinel_assisted_intakes i
    join public.sentinel_companies c
      on c.id = i.company_id and c.organization_id = i.organization_id and c.deleted_at is null
    where i.source_code = 'federal-cnd'
      and i.valid_until is not null
    order by i.organization_id, i.company_id, i.checked_at desc, i.created_at desc
  ), candidates as (
    select *,
      case when days_left < 0 then 'critical' else 'attention' end as alert_severity,
      case when days_left < 0 then 'CND vencida' else 'CND próxima do vencimento' end as alert_title
    from latest_cnd
    where days_left <= 30
  )
  insert into public.sentinel_notifications (
    organization_id, category, title, message, severity, entity_type, entity_id
  )
  select
    c.organization_id,
    'certificate',
    c.alert_title,
    case
      when c.days_left < 0 then c.legal_name || ': a CND venceu há ' || abs(c.days_left) || ' dia(s).'
      else c.legal_name || ': a CND vence em ' || c.days_left || ' dia(s).'
    end,
    c.alert_severity,
    'assisted_intake',
    c.id
  from candidates c
  where not exists (
    select 1 from public.sentinel_notifications n
    where n.organization_id = c.organization_id
      and n.entity_type = 'assisted_intake'
      and n.entity_id = c.id
      and n.title = c.alert_title
      and n.resolved_at is null
  );

  with latest_cnd as (
    select distinct on (i.organization_id, i.company_id)
      i.id, i.organization_id, i.company_id, i.valid_until,
      floor(extract(epoch from (i.valid_until - now())) / 86400)::integer as days_left
    from public.sentinel_assisted_intakes i
    where i.source_code = 'federal-cnd'
      and i.company_id is not null
      and i.valid_until is not null
    order by i.organization_id, i.company_id, i.checked_at desc, i.created_at desc
  )
  insert into public.sentinel_tasks (
    organization_id, company_id, title, priority, status, due_at, created_at, updated_at
  )
  select
    c.organization_id,
    c.company_id,
    'Renovar ou revisar CND Federal',
    case when c.days_left < 0 then 'critical' else 'high' end,
    'open',
    c.valid_until,
    now(),
    now()
  from latest_cnd c
  where c.days_left <= 30
    and not exists (
      select 1 from public.sentinel_tasks t
      where t.organization_id = c.organization_id
        and t.company_id = c.company_id
        and t.title = 'Renovar ou revisar CND Federal'
        and t.status in ('open','in_progress','waiting')
        and t.deleted_at is null
    );

  update public.sentinel_companies c
  set fiscal_status = 'stale', updated_at = now(), version = c.version + 1
  where c.fiscal_status in ('regular','attention','not_checked')
    and exists (
      select 1
      from (
        select distinct on (i.organization_id, i.company_id)
          i.organization_id, i.company_id, i.valid_until
        from public.sentinel_assisted_intakes i
        where i.source_code = 'federal-cnd' and i.valid_until is not null
        order by i.organization_id, i.company_id, i.checked_at desc, i.created_at desc
      ) latest
      where latest.organization_id = c.organization_id
        and latest.company_id = c.id
        and latest.valid_until < now()
    );
end;
$$;

revoke all on function private.sentinel_refresh_assisted_cnd_alerts() from public, anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'sentinela-assisted-cnd-validity-daily' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'sentinela-assisted-cnd-validity-daily',
    '0 10 * * *',
    'select private.sentinel_refresh_assisted_cnd_alerts();'
  );
end
$$;

select private.sentinel_refresh_assisted_cnd_alerts();
