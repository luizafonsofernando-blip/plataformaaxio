-- Cover Compliance foreign keys used by deletes, ownership changes and relational lookups.
create index if not exists sentinel_compliance_categories_created_by_idx
  on public.sentinel_compliance_categories(created_by) where created_by is not null;

create index if not exists sentinel_compliance_profiles_company_idx
  on public.sentinel_compliance_company_profiles(company_id);
create index if not exists sentinel_compliance_profiles_treatment_owner_idx
  on public.sentinel_compliance_company_profiles(treatment_owner_id) where treatment_owner_id is not null;
create index if not exists sentinel_compliance_profiles_monitoring_owner_idx
  on public.sentinel_compliance_company_profiles(monitoring_owner_id) where monitoring_owner_id is not null;
create index if not exists sentinel_compliance_profiles_created_by_idx
  on public.sentinel_compliance_company_profiles(created_by) where created_by is not null;
create index if not exists sentinel_compliance_profiles_updated_by_idx
  on public.sentinel_compliance_company_profiles(updated_by) where updated_by is not null;

create index if not exists sentinel_compliance_cases_company_fk_idx
  on public.sentinel_compliance_cases(company_id) where company_id is not null;
create index if not exists sentinel_compliance_cases_assigned_to_idx
  on public.sentinel_compliance_cases(assigned_to) where assigned_to is not null;
create index if not exists sentinel_compliance_cases_created_by_idx
  on public.sentinel_compliance_cases(created_by) where created_by is not null;
create index if not exists sentinel_compliance_cases_updated_by_idx
  on public.sentinel_compliance_cases(updated_by) where updated_by is not null;

create index if not exists sentinel_compliance_outreach_case_fk_idx
  on public.sentinel_compliance_outreach(case_id);
create index if not exists sentinel_compliance_outreach_created_by_idx
  on public.sentinel_compliance_outreach(created_by) where created_by is not null;

create index if not exists sentinel_compliance_snapshots_document_idx
  on public.sentinel_compliance_snapshots(source_document_id) where source_document_id is not null;
create index if not exists sentinel_compliance_snapshots_confirmed_by_idx
  on public.sentinel_compliance_snapshots(confirmed_by) where confirmed_by is not null;

create index if not exists sentinel_compliance_imports_document_idx
  on public.sentinel_compliance_import_batches(document_id) where document_id is not null;
create index if not exists sentinel_compliance_imports_created_by_idx
  on public.sentinel_compliance_import_batches(created_by) where created_by is not null;
create index if not exists sentinel_compliance_imports_confirmed_by_idx
  on public.sentinel_compliance_import_batches(confirmed_by) where confirmed_by is not null;

create index if not exists sentinel_compliance_sources_snapshot_fk_idx
  on public.sentinel_compliance_snapshot_sources(snapshot_id);
create index if not exists sentinel_compliance_sources_batch_fk_idx
  on public.sentinel_compliance_snapshot_sources(import_batch_id);
create index if not exists sentinel_compliance_sources_document_idx
  on public.sentinel_compliance_snapshot_sources(document_id) where document_id is not null;

create index if not exists sentinel_compliance_events_case_fk_idx
  on public.sentinel_compliance_case_events(case_id);
create index if not exists sentinel_compliance_events_actor_idx
  on public.sentinel_compliance_case_events(actor_id) where actor_id is not null;
create index if not exists sentinel_compliance_events_document_idx
  on public.sentinel_compliance_case_events(attachment_document_id) where attachment_document_id is not null;
