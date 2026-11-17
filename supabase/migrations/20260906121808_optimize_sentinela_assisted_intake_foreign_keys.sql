create index if not exists sentinel_assisted_intakes_document_idx
  on public.sentinel_assisted_intakes(document_id) where document_id is not null;
create index if not exists sentinel_assisted_intakes_snapshot_idx
  on public.sentinel_assisted_intakes(snapshot_id) where snapshot_id is not null;
create index if not exists sentinel_assisted_intakes_occurrence_idx
  on public.sentinel_assisted_intakes(occurrence_id) where occurrence_id is not null;
create index if not exists sentinel_assisted_intakes_task_idx
  on public.sentinel_assisted_intakes(task_id) where task_id is not null;
create index if not exists sentinel_assisted_intakes_created_by_idx
  on public.sentinel_assisted_intakes(created_by) where created_by is not null;
