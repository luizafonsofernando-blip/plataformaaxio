-- RTC reports are private, immutable evidence tied to one analysis and company.
alter table public.rtc_analyses
  add constraint rtc_analyses_id_org_company_unique unique (id, organization_id, company_id);
alter table public.rtc_analyses
  add constraint rtc_analyses_id_org_unique unique (id, organization_id);

alter table public.rtc_audit_events
  add constraint rtc_audit_analysis_org_fk foreign key (analysis_id, organization_id)
  references public.rtc_analyses (id, organization_id) on delete restrict;

create table public.rtc_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  company_id uuid not null,
  analysis_id uuid not null,
  object_name text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_length bigint not null check (byte_length between 1 and 20971520),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (analysis_id, organization_id, company_id)
    references public.rtc_analyses (id, organization_id, company_id) on delete restrict,
  constraint rtc_report_object_name_check check (
    object_name = organization_id::text || '/' || company_id::text || '/' || id::text || '.pdf'
  )
);
create index rtc_reports_analysis_idx on public.rtc_reports (analysis_id, created_at desc);
create index rtc_reports_company_time_idx on public.rtc_reports (company_id, created_at desc);

create function public.rtc_reject_evidence_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'RTC evidence is immutable';
end;
$$;
revoke all on function public.rtc_reject_evidence_mutation() from public, anon, authenticated;
create trigger rtc_reports_immutable before update or delete on public.rtc_reports
  for each row execute function public.rtc_reject_evidence_mutation();
create trigger rtc_audit_immutable before update or delete on public.rtc_audit_events
  for each row execute function public.rtc_reject_evidence_mutation();

alter table public.rtc_reports enable row level security;
revoke all on public.rtc_reports from anon, authenticated;
grant select on public.rtc_reports, public.rtc_audit_events to authenticated;
grant select, insert on public.rtc_reports to service_role;

create policy rtc_reports_company_select on public.rtc_reports
  for select to authenticated using (exists (
    select 1 from public.rtc_companies c
    where c.id = rtc_reports.company_id and c.organization_id = rtc_reports.organization_id
  ));

create policy rtc_audit_admin_select on public.rtc_audit_events
  for select to authenticated using (exists (
    select 1 from public.rtc_memberships m
    where m.organization_id = rtc_audit_events.organization_id
      and m.user_id = (select auth.uid()) and m.status = 'active' and m.role = 'admin'
  ));

create function public.rtc_register_report(
  p_id uuid, p_organization_id uuid, p_company_id uuid, p_analysis_id uuid,
  p_object_name text, p_sha256 text, p_byte_length bigint, p_created_by uuid
) returns uuid language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.rtc_analyses a
    where a.id = p_analysis_id and a.organization_id = p_organization_id
      and a.company_id = p_company_id and a.status = 'completed'
  ) then
    raise exception 'Only completed RTC analyses can have reports';
  end if;
  insert into public.rtc_reports
    (id, organization_id, company_id, analysis_id, object_name, sha256, byte_length, created_by)
  values
    (p_id, p_organization_id, p_company_id, p_analysis_id, p_object_name, p_sha256, p_byte_length, p_created_by);
  insert into public.rtc_audit_events
    (organization_id, actor_id, analysis_id, event_type, details)
  values
    (p_organization_id, p_created_by, p_analysis_id, 'report_created',
     jsonb_build_object('report_id', p_id, 'sha256', p_sha256));
  return p_id;
end;
$$;
revoke all on function public.rtc_register_report(uuid, uuid, uuid, uuid, text, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.rtc_register_report(uuid, uuid, uuid, uuid, text, text, bigint, uuid) to service_role;

create function public.rtc_register_analysis(
  p_organization_id uuid, p_company_id uuid, p_requested_by uuid,
  p_operation_date date, p_engine text, p_engine_version text,
  p_rules_version text, p_source_commit text, p_status text,
  p_input_data jsonb, p_output_data jsonb, p_correlation_id uuid
) returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.rtc_analyses
    (id, organization_id, company_id, requested_by, operation_date, engine,
     engine_version, rules_version, source_commit, status, input_data, output_data, correlation_id)
  values
    (v_id, p_organization_id, p_company_id, p_requested_by, p_operation_date, p_engine,
     p_engine_version, p_rules_version, p_source_commit, p_status, p_input_data, p_output_data, p_correlation_id);
  insert into public.rtc_audit_events
    (organization_id, actor_id, analysis_id, event_type, details)
  values
    (p_organization_id, p_requested_by, v_id, 'analysis_created',
     jsonb_build_object('engine', p_engine, 'status', p_status, 'correlation_id', p_correlation_id));
  return v_id;
end;
$$;
revoke all on function public.rtc_register_analysis(uuid, uuid, uuid, date, text, text, text, text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.rtc_register_analysis(uuid, uuid, uuid, date, text, text, text, text, text, jsonb, jsonb, uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rtc-reports', 'rtc-reports', false, 20971520, array['application/pdf']);

create policy rtc_report_storage_read on storage.objects
  for select to authenticated using (
    bucket_id = 'rtc-reports' and exists (
      select 1 from public.rtc_reports r where r.object_name = storage.objects.name
    )
  );
