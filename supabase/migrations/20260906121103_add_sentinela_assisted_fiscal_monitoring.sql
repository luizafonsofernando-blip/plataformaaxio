-- Free, assisted monitoring for federal sources while official API credentials are unavailable.
alter table public.sentinel_integrations
  drop constraint if exists sentinel_integrations_status_check;

alter table public.sentinel_integrations
  add constraint sentinel_integrations_status_check
  check (status in ('operational','assisted','unstable','unavailable','configuration','unsupported','development'));

create table if not exists public.sentinel_assisted_intakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  company_id uuid references public.sentinel_companies(id) on delete restrict,
  document_id uuid references public.sentinel_documents(id) on delete set null,
  snapshot_id uuid references public.sentinel_fiscal_snapshots(id) on delete set null,
  occurrence_id uuid references public.sentinel_occurrences(id) on delete set null,
  task_id uuid references public.sentinel_tasks(id) on delete set null,
  source_code text not null check (source_code in ('federal-cnd','federal-situation','federal-mailbox')),
  intake_kind text not null default 'document_upload' check (intake_kind in ('document_upload','email_alert','manual')),
  processing_status text not null default 'processed' check (processing_status in ('received','processed','review','rejected')),
  official_status text not null default 'unknown' check (official_status in ('regular','attention','relevant','critical','unknown')),
  source_reference text,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  extracted_data jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  valid_until timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, source_code, content_hash)
);

create index if not exists sentinel_assisted_intakes_company_idx
  on public.sentinel_assisted_intakes(organization_id, company_id, checked_at desc);
create index if not exists sentinel_assisted_intakes_validity_idx
  on public.sentinel_assisted_intakes(organization_id, valid_until)
  where valid_until is not null;

alter table public.sentinel_assisted_intakes enable row level security;
alter table public.sentinel_assisted_intakes force row level security;

revoke all on public.sentinel_assisted_intakes from public, anon, authenticated;
grant select on public.sentinel_assisted_intakes to authenticated;

drop policy if exists sentinel_assisted_intakes_select on public.sentinel_assisted_intakes;
create policy sentinel_assisted_intakes_select
  on public.sentinel_assisted_intakes for select to authenticated
  using ((select private.sentinel_is_member(organization_id)));

insert into public.sentinel_permissions (code, name, description) values
  ('integrations.operate', 'Operar integrações assistidas', 'Importar e processar fontes oficiais pelo fluxo assistido.')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.sentinel_role_permissions (role, permission_code) values
  ('analyst','integrations.operate'),
  ('supervisor','integrations.operate'),
  ('admin','integrations.operate')
on conflict do nothing;

update public.sentinel_integrations
set status = 'assisted',
    environment = 'production',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'access_mode', 'assisted',
      'provider_adapter', code,
      'portal_generation', 'portal-agnostic',
      'migration_ready', true,
      'requires_human_confirmation', true,
      'official_api', false
    ),
    updated_at = now()
where code in ('federal-cnd','federal-situation','federal-mailbox');

update public.sentinel_feature_flags
set enabled = true,
    rollout_percentage = 100,
    metadata = coalesce(metadata, '{}'::jsonb) || '{"mode":"assisted","official_api":false,"migration_ready":true}'::jsonb,
    updated_at = now()
where code in ('federal-cnd','federal-situation','federal-mailbox');

comment on table public.sentinel_assisted_intakes is
  'Audit trail for user-confirmed official documents and mailbox alerts; no Gov.br credentials are stored.';
