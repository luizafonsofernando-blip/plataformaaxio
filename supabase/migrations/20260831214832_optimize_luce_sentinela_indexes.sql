-- Cover foreign keys used by Sentinela joins, deletes and audit queries.
create index if not exists sentinel_companies_created_by_idx on public.sentinel_companies(created_by) where created_by is not null;
create index if not exists sentinel_companies_updated_by_idx on public.sentinel_companies(updated_by) where updated_by is not null;
create index if not exists sentinel_occurrences_company_idx on public.sentinel_occurrences(company_id) where company_id is not null;
create index if not exists sentinel_occurrences_assigned_idx on public.sentinel_occurrences(assigned_to) where assigned_to is not null;
create index if not exists sentinel_occurrences_created_by_idx on public.sentinel_occurrences(created_by) where created_by is not null;
create index if not exists sentinel_occurrences_updated_by_idx on public.sentinel_occurrences(updated_by) where updated_by is not null;
create index if not exists sentinel_tasks_company_idx on public.sentinel_tasks(company_id) where company_id is not null;
create index if not exists sentinel_tasks_occurrence_idx on public.sentinel_tasks(occurrence_id) where occurrence_id is not null;
create index if not exists sentinel_tasks_assigned_idx on public.sentinel_tasks(assigned_to) where assigned_to is not null;
create index if not exists sentinel_tasks_created_by_idx on public.sentinel_tasks(created_by) where created_by is not null;
create index if not exists sentinel_tasks_updated_by_idx on public.sentinel_tasks(updated_by) where updated_by is not null;
create index if not exists sentinel_documents_occurrence_idx on public.sentinel_documents(occurrence_id) where occurrence_id is not null;
create index if not exists sentinel_documents_created_by_idx on public.sentinel_documents(created_by) where created_by is not null;
create index if not exists sentinel_notifications_entity_idx on public.sentinel_notifications(entity_type, entity_id) where entity_id is not null;
create index if not exists sentinel_audit_actor_idx on public.sentinel_audit_events(actor_id, created_at desc) where actor_id is not null;
