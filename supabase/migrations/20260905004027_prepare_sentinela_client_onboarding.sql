-- Prepare Luce Sentinela for real client onboarding without enabling external connectors.
alter table public.sentinel_companies
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists municipal_registration text,
  add column if not exists state_registration text,
  add column if not exists monitoring_enabled boolean not null default true,
  add column if not exists onboarding_status text not null default 'ready'
    check (onboarding_status in ('draft','ready','review','inactive'));

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

create table if not exists public.sentinel_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  filename text not null,
  status text not null default 'processing' check (status in ('processing','completed','completed_with_errors','failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.sentinel_import_rows (
  id bigserial primary key,
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  batch_id uuid not null references public.sentinel_import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  cnpj text,
  legal_name text,
  status text not null check (status in ('imported','updated','rejected')),
  company_id uuid references public.sentinel_companies(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create index if not exists sentinel_companies_monitoring_idx
  on public.sentinel_companies(organization_id, monitoring_enabled, onboarding_status)
  where deleted_at is null;
create index if not exists sentinel_import_batches_org_idx
  on public.sentinel_import_batches(organization_id, created_at desc);
create index if not exists sentinel_import_rows_batch_idx
  on public.sentinel_import_rows(batch_id, row_number);

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
  ('analyst','workflow.read'), ('analyst','workflow.write'),
  ('analyst','documents.read'), ('analyst','documents.write'), ('analyst','integrations.read'),
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
alter table public.sentinel_import_batches enable row level security;
alter table public.sentinel_import_batches force row level security;
alter table public.sentinel_import_rows enable row level security;
alter table public.sentinel_import_rows force row level security;

revoke all on public.sentinel_permissions, public.sentinel_role_permissions,
  public.sentinel_import_batches, public.sentinel_import_rows from public, anon, authenticated;
grant select on public.sentinel_permissions, public.sentinel_role_permissions,
  public.sentinel_import_batches, public.sentinel_import_rows to authenticated;
grant all on public.sentinel_permissions, public.sentinel_role_permissions,
  public.sentinel_import_batches, public.sentinel_import_rows to service_role;
grant usage, select on sequence public.sentinel_import_rows_id_seq to service_role;

create policy sentinel_permissions_member_read on public.sentinel_permissions
  for select to authenticated using (exists (
    select 1 from public.sentinel_memberships m
    where m.user_id = (select auth.uid()) and m.status = 'active'
  ));
create policy sentinel_role_permissions_member_read on public.sentinel_role_permissions
  for select to authenticated using (exists (
    select 1 from public.sentinel_memberships m
    where m.user_id = (select auth.uid()) and m.status = 'active'
  ));
create policy sentinel_import_batches_member_read on public.sentinel_import_batches
  for select to authenticated using ((select private.sentinel_is_member(organization_id)));
create policy sentinel_import_rows_member_read on public.sentinel_import_rows
  for select to authenticated using ((select private.sentinel_is_member(organization_id)));

-- Private bucket. Files are served through authenticated server-side endpoints only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sentinel-documents', 'sentinel-documents', false, 10485760,
  array['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.sentinel_import_batches is 'Auditable client import batches for Luce Sentinela.';
comment on table public.sentinel_role_permissions is 'Expandable RBAC permission matrix enforced by the server-side API.';
