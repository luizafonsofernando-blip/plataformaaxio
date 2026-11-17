-- Native Compliance workspace for Luce Sentinela.
-- All operational writes remain server-side; authenticated clients receive tenant-scoped read access only.

-- Keep this migration compatible with Sentinela installations created before the
-- expandable permission catalog was introduced.
create table if not exists public.sentinel_permissions (
  code text primary key check (code ~ '^[a-z][a-z0-9_.-]+$'),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.sentinel_role_permissions (
  role text not null check (role in ('viewer','analyst','supervisor','admin')),
  permission_code text not null references public.sentinel_permissions(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission_code)
);

insert into public.sentinel_permissions (code, name, description) values
  ('companies.read', 'Visualizar empresas', 'Consultar empresas e fichas fiscais.'),
  ('companies.write', 'Cadastrar empresas', 'Criar e atualizar empresas.'),
  ('companies.delete', 'Excluir empresas', 'Realizar exclusão lógica de empresas.'),
  ('companies.import', 'Importar empresas', 'Importar clientes por planilha.'),
  ('workflow.read', 'Visualizar workflow', 'Consultar ocorrências, tarefas e comentários.'),
  ('workflow.write', 'Tratar workflow', 'Criar e atualizar ocorrências, tarefas e comentários.'),
  ('workflow.delete', 'Excluir workflow', 'Realizar exclusão lógica de itens do workflow.'),
  ('documents.read', 'Visualizar documentos', 'Consultar documentos e evidências.'),
  ('documents.write', 'Registrar documentos', 'Cadastrar documentos e evidências.'),
  ('documents.delete', 'Excluir documentos', 'Realizar exclusão lógica de documentos.'),
  ('integrations.read', 'Visualizar integrações', 'Consultar matriz e saúde das integrações.'),
  ('settings.manage', 'Administrar Sentinela', 'Gerenciar configurações internas do módulo.')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.sentinel_role_permissions (role, permission_code)
select role_name, permission_code
from (values
  ('viewer','companies.read'), ('viewer','workflow.read'), ('viewer','documents.read'), ('viewer','integrations.read'),
  ('analyst','companies.read'), ('analyst','companies.write'), ('analyst','companies.import'),
  ('analyst','workflow.read'), ('analyst','workflow.write'), ('analyst','documents.read'), ('analyst','documents.write'), ('analyst','integrations.read'),
  ('supervisor','companies.read'), ('supervisor','companies.write'), ('supervisor','companies.delete'), ('supervisor','companies.import'),
  ('supervisor','workflow.read'), ('supervisor','workflow.write'), ('supervisor','workflow.delete'),
  ('supervisor','documents.read'), ('supervisor','documents.write'), ('supervisor','documents.delete'), ('supervisor','integrations.read'),
  ('admin','companies.read'), ('admin','companies.write'), ('admin','companies.delete'), ('admin','companies.import'),
  ('admin','workflow.read'), ('admin','workflow.write'), ('admin','workflow.delete'),
  ('admin','documents.read'), ('admin','documents.write'), ('admin','documents.delete'),
  ('admin','integrations.read'), ('admin','settings.manage')
) as grants(role_name, permission_code)
on conflict do nothing;

alter table public.sentinel_permissions enable row level security;
alter table public.sentinel_permissions force row level security;
alter table public.sentinel_role_permissions enable row level security;
alter table public.sentinel_role_permissions force row level security;
revoke all on public.sentinel_permissions, public.sentinel_role_permissions from public, anon, authenticated;
grant select on public.sentinel_permissions, public.sentinel_role_permissions to authenticated;
grant all on public.sentinel_permissions, public.sentinel_role_permissions to service_role;
drop policy if exists sentinel_permissions_member_read on public.sentinel_permissions;
create policy sentinel_permissions_member_read on public.sentinel_permissions
  for select to authenticated using (exists (
    select 1 from public.sentinel_memberships membership
    where membership.user_id = (select auth.uid()) and membership.status = 'active'
  ));
drop policy if exists sentinel_role_permissions_member_read on public.sentinel_role_permissions;
create policy sentinel_role_permissions_member_read on public.sentinel_role_permissions
  for select to authenticated using (exists (
    select 1 from public.sentinel_memberships membership
    where membership.user_id = (select auth.uid()) and membership.status = 'active'
  ));

create table if not exists public.sentinel_compliance_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_-]+$'),
  name text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.sentinel_compliance_company_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  company_id uuid not null references public.sentinel_companies(id) on delete cascade,
  monitoring_status text not null default 'active' check (monitoring_status in ('active','paused','inactive')),
  treatment_owner_id uuid references auth.users(id) on delete set null,
  treatment_owner_name text,
  monitoring_owner_id uuid references auth.users(id) on delete set null,
  monitoring_owner_name text,
  client_contact_name text,
  client_contact_email text,
  client_contact_phone text,
  notes text,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, company_id)
);

create table if not exists public.sentinel_compliance_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  company_id uuid references public.sentinel_companies(id) on delete restrict,
  source_company_name text,
  category_code text not null default 'other',
  origin text not null default 'internal' check (origin in ('internal','external','maed','manual','import')),
  obligation text,
  competence text,
  title text not null,
  description text,
  external_identifier text,
  initial_state text,
  status text not null default 'identified' check (status in (
    'identified','analysis','assigned','action_requested','waiting_responsible','waiting_client',
    'waiting_payment','waiting_agency','regularizing','resolved','closed'
  )),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  priority_reason text,
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_name text,
  department text,
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  due_at timestamptz,
  internal_due_at timestamptz,
  gestta_task text,
  notes text,
  next_action text,
  completion_notes text,
  resolved_at timestamptz,
  source_reference text,
  source_fingerprint text,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists sentinel_compliance_case_fingerprint_uidx
  on public.sentinel_compliance_cases(organization_id, source_fingerprint)
  where source_fingerprint is not null and deleted_at is null;
create index if not exists sentinel_compliance_cases_queue_idx
  on public.sentinel_compliance_cases(organization_id, status, priority, internal_due_at)
  where deleted_at is null;
create index if not exists sentinel_compliance_cases_company_idx
  on public.sentinel_compliance_cases(organization_id, company_id, created_at desc)
  where deleted_at is null;
create index if not exists sentinel_compliance_cases_origin_idx
  on public.sentinel_compliance_cases(organization_id, origin, created_at desc)
  where deleted_at is null;

create table if not exists public.sentinel_compliance_outreach (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  case_id uuid not null references public.sentinel_compliance_cases(id) on delete cascade,
  audience text not null check (audience in ('internal','client','external_agency','other')),
  contacted_name text not null,
  request_summary text not null,
  requested_at timestamptz not null default now(),
  response_due_at timestamptz,
  responded_at timestamptz,
  response_summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists sentinel_compliance_outreach_case_idx
  on public.sentinel_compliance_outreach(organization_id, case_id, requested_at desc)
  where deleted_at is null;

create table if not exists public.sentinel_compliance_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  snapshot_type text not null check (snapshot_type in ('baseline','monthly')),
  period_start date not null,
  period_end date not null,
  label text not null,
  metrics jsonb not null default '{}'::jsonb,
  source_document_id uuid references public.sentinel_documents(id) on delete set null,
  source_hash text,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (organization_id, snapshot_type, period_start, period_end)
);

create unique index if not exists sentinel_compliance_baseline_uidx
  on public.sentinel_compliance_snapshots(organization_id)
  where snapshot_type = 'baseline';

create or replace function private.sentinel_preserve_compliance_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Compliance snapshots are immutable';
end;
$$;

drop trigger if exists sentinel_compliance_snapshots_immutable on public.sentinel_compliance_snapshots;
create trigger sentinel_compliance_snapshots_immutable
before update or delete on public.sentinel_compliance_snapshots
for each row execute function private.sentinel_preserve_compliance_snapshot();

create table if not exists public.sentinel_compliance_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  source_kind text not null check (source_kind in ('general_report','executive_presentation','spreadsheet','other')),
  file_hash text not null,
  status text not null default 'preview' check (status in ('preview','confirmed','cancelled','failed')),
  detected_period_start date,
  detected_period_end date,
  extracted_summary jsonb not null default '{}'::jsonb,
  preview_payload jsonb not null default '{}'::jsonb,
  document_id uuid references public.sentinel_documents(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists sentinel_compliance_import_org_idx
  on public.sentinel_compliance_import_batches(organization_id, created_at desc);
create unique index if not exists sentinel_compliance_import_active_hash_uidx
  on public.sentinel_compliance_import_batches(organization_id, file_hash)
  where status in ('preview','confirmed');

create table if not exists public.sentinel_compliance_snapshot_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  snapshot_id uuid not null references public.sentinel_compliance_snapshots(id) on delete cascade,
  import_batch_id uuid not null references public.sentinel_compliance_import_batches(id) on delete restrict,
  document_id uuid references public.sentinel_documents(id) on delete set null,
  source_kind text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, import_batch_id)
);

create index if not exists sentinel_compliance_snapshot_sources_idx
  on public.sentinel_compliance_snapshot_sources(organization_id, snapshot_id, created_at);

create table if not exists public.sentinel_compliance_case_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  case_id uuid not null references public.sentinel_compliance_cases(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  before_data jsonb,
  after_data jsonb,
  comment text,
  attachment_document_id uuid references public.sentinel_documents(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sentinel_compliance_case_events_idx
  on public.sentinel_compliance_case_events(organization_id, case_id, created_at desc);

insert into public.sentinel_permissions (code, name, description) values
  ('compliance.view', 'Visualizar Compliance', 'Consultar painéis, empresas, ocorrências e histórico de Compliance.'),
  ('compliance.create', 'Criar no Compliance', 'Criar ocorrências, acionamentos e importações de Compliance.'),
  ('compliance.edit', 'Editar no Compliance', 'Atualizar ocorrências e controles de Compliance.'),
  ('compliance.delete', 'Excluir no Compliance', 'Realizar exclusão lógica de registros operacionais de Compliance.'),
  ('compliance.assign', 'Atribuir no Compliance', 'Definir responsáveis e departamentos para ocorrências.'),
  ('compliance.report', 'Gerar relatórios de Compliance', 'Gerar relatórios gerenciais e de evolução.'),
  ('compliance.export', 'Exportar dados de Compliance', 'Exportar relatórios em formatos institucionais.'),
  ('compliance.admin', 'Administrar Compliance', 'Gerenciar categorias, prioridades e configurações de Compliance.')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.sentinel_role_permissions (role, permission_code)
select role_name, permission_code
from (values
  ('viewer','compliance.view'),
  ('analyst','compliance.view'), ('analyst','compliance.create'), ('analyst','compliance.edit'), ('analyst','compliance.assign'),
  ('supervisor','compliance.view'), ('supervisor','compliance.create'), ('supervisor','compliance.edit'),
  ('supervisor','compliance.delete'), ('supervisor','compliance.assign'), ('supervisor','compliance.report'), ('supervisor','compliance.export'),
  ('admin','compliance.view'), ('admin','compliance.create'), ('admin','compliance.edit'), ('admin','compliance.delete'),
  ('admin','compliance.assign'), ('admin','compliance.report'), ('admin','compliance.export'), ('admin','compliance.admin')
) as grants(role_name, permission_code)
on conflict do nothing;

insert into public.sentinel_compliance_categories (organization_id, code, name, sort_order)
select organization_id, category.code, category.name, category.sort_order
from (select distinct organization_id from public.sentinel_memberships) organizations
cross join (values
  ('dctfweb','DCTFWeb',10), ('inss_gps','INSS e GPS',20), ('fgts','FGTS',30),
  ('simples_das','Simples Nacional e DAS',40), ('pis_cofins','PIS e COFINS',50),
  ('irpj_csll','IRPJ e CSLL',60), ('pgfn','PGFN e dívida ativa',70),
  ('installment','Parcelamentos',80), ('process','Processos',90), ('maed','MAED',100), ('other','Outros',999)
) as category(code, name, sort_order)
on conflict (organization_id, code) do nothing;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'sentinel_compliance_categories','sentinel_compliance_company_profiles','sentinel_compliance_cases',
    'sentinel_compliance_outreach','sentinel_compliance_snapshots','sentinel_compliance_import_batches','sentinel_compliance_snapshot_sources',
    'sentinel_compliance_case_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    execute format(
      'create policy sentinel_compliance_member_read on public.%I for select to authenticated using ((select private.sentinel_is_member(organization_id)))',
      table_name
    );
  end loop;
end $$;

revoke all on sequence public.sentinel_compliance_case_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.sentinel_compliance_case_events_id_seq to service_role;

comment on table public.sentinel_compliance_cases is 'Tenant-scoped operational Compliance cases inside Luce Sentinela.';
comment on table public.sentinel_compliance_snapshots is 'Immutable confirmed Compliance baselines and monthly snapshots.';
comment on table public.sentinel_compliance_import_batches is 'Two-step Compliance imports: preview first, explicit confirmation second.';

update storage.buckets
set allowed_mime_types = array[
  'application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.spreadsheet'
]
where id = 'sentinel-documents';

create or replace function public.sentinel_confirm_compliance_import(
  p_batch_id uuid,
  p_organization_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_batch public.sentinel_compliance_import_batches%rowtype;
  v_snapshot_id uuid;
  v_snapshot_type text;
  v_inserted integer := 0;
  v_period_start date;
  v_period_end date;
  v_snapshot_created boolean := false;
begin
  select * into v_batch
  from public.sentinel_compliance_import_batches
  where id = p_batch_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Compliance import batch not found';
  end if;
  if v_batch.status <> 'preview' then
    raise exception 'Compliance import batch is not awaiting confirmation';
  end if;

  v_period_start := coalesce(v_batch.detected_period_start, current_date);
  v_period_end := coalesce(v_batch.detected_period_end, v_period_start);
  select id, snapshot_type into v_snapshot_id, v_snapshot_type
  from public.sentinel_compliance_snapshots
  where organization_id = p_organization_id
    and period_start = v_period_start
    and period_end = v_period_end
  order by case when snapshot_type = 'baseline' then 0 else 1 end
  limit 1;

  if v_snapshot_id is null then
    select case when exists (
      select 1 from public.sentinel_compliance_snapshots
      where organization_id = p_organization_id and snapshot_type = 'baseline'
    ) then 'monthly' else 'baseline' end into v_snapshot_type;

    insert into public.sentinel_compliance_snapshots (
      organization_id, snapshot_type, period_start, period_end, label, metrics,
      source_document_id, source_hash, confirmed_by
    ) values (
      p_organization_id, v_snapshot_type, v_period_start, v_period_end,
      coalesce(nullif(v_batch.extracted_summary->>'label', ''), v_batch.filename),
      coalesce(v_batch.extracted_summary->'metrics', '{}'::jsonb),
      v_batch.document_id, v_batch.file_hash, p_actor_id
    ) returning id into v_snapshot_id;
    v_snapshot_created := true;
  end if;

  insert into public.sentinel_compliance_snapshot_sources (
    organization_id, snapshot_id, import_batch_id, document_id, source_kind
  ) values (
    p_organization_id, v_snapshot_id, p_batch_id, v_batch.document_id, v_batch.source_kind
  ) on conflict (organization_id, import_batch_id) do nothing;

  with source_rows as (
    select value as item
    from jsonb_array_elements(coalesce(v_batch.preview_payload->'cases', '[]'::jsonb))
  ), inserted as (
    insert into public.sentinel_compliance_cases (
      organization_id, company_id, source_company_name, category_code, origin,
      obligation, competence, title, description, status, priority, priority_reason,
      assigned_name, department, amount_cents, due_at, internal_due_at, gestta_task,
      notes, next_action, resolved_at, source_reference, source_fingerprint,
      created_by, updated_by
    )
    select
      p_organization_id,
      nullif(item->>'companyId', '')::uuid,
      nullif(item->>'companyName', ''),
      coalesce(nullif(item->>'categoryCode', ''), 'other'),
      coalesce(nullif(item->>'origin', ''), 'import'),
      nullif(item->>'obligation', ''),
      nullif(item->>'competence', ''),
      coalesce(nullif(item->>'title', ''), 'Ocorrência importada'),
      nullif(item->>'description', ''),
      case when item->>'status' in (
        'identified','analysis','assigned','action_requested','waiting_responsible','waiting_client',
        'waiting_payment','waiting_agency','regularizing','resolved','closed'
      ) then item->>'status' else 'analysis' end,
      case when item->>'priority' in ('low','normal','high','critical') then item->>'priority' else 'normal' end,
      nullif(item->>'priorityReason', ''),
      nullif(item->>'assignedName', ''),
      nullif(item->>'department', ''),
      nullif(item->>'amountCents', '')::bigint,
      nullif(item->>'dueAt', '')::timestamptz,
      nullif(item->>'internalDueAt', '')::timestamptz,
      nullif(item->>'gesttaTask', ''),
      nullif(item->>'notes', ''),
      nullif(item->>'nextAction', ''),
      nullif(item->>'resolvedAt', '')::timestamptz,
      v_batch.filename,
      coalesce(nullif(item->>'fingerprint', ''), md5(item::text)),
      p_actor_id,
      p_actor_id
    from source_rows
    on conflict (organization_id, source_fingerprint)
      where source_fingerprint is not null and deleted_at is null
      do nothing
    returning id
  )
  select count(*) into v_inserted from inserted;

  update public.sentinel_compliance_import_batches
  set status = 'confirmed', confirmed_by = p_actor_id, confirmed_at = now()
  where id = p_batch_id;

  return jsonb_build_object(
    'batchId', p_batch_id,
    'snapshotId', v_snapshot_id,
    'snapshotType', v_snapshot_type,
    'snapshotCreated', v_snapshot_created,
    'casesImported', v_inserted
  );
end;
$$;

revoke all on function public.sentinel_confirm_compliance_import(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.sentinel_confirm_compliance_import(uuid, uuid, uuid) to service_role;
revoke all on function private.sentinel_preserve_compliance_snapshot() from public, anon, authenticated;
grant execute on function private.sentinel_preserve_compliance_snapshot() to service_role;
