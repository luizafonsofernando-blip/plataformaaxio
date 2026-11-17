-- Luce Sentinela V1: multi-tenant fiscal operations foundation.
create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.sentinel_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sentinel_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'analyst' check (role in ('viewer','analyst','supervisor','admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.sentinel_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  legal_name text not null check (char_length(legal_name) between 2 and 180),
  trade_name text,
  tax_regime text,
  main_cnae text,
  city text,
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  internal_owner text,
  fiscal_status text not null default 'not_checked' check (fiscal_status in ('regular','attention','relevant','critical','not_checked','unavailable','stale')),
  risk_score smallint check (risk_score is null or risk_score between 0 and 100),
  last_checked_at timestamptz,
  notes text,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, cnpj)
);

create table if not exists public.sentinel_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  company_id uuid references public.sentinel_companies(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 180),
  description text,
  category text not null default 'fiscal',
  source text not null default 'manual',
  severity text not null default 'attention' check (severity in ('regular','attention','relevant','critical','unknown')),
  status text not null default 'new' check (status in ('new','analysis','waiting_client','waiting_agency','execution','resolved','archived')),
  department text,
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_name text,
  due_at timestamptz,
  resolved_at timestamptz,
  official_data jsonb not null default '{}'::jsonb,
  ai_interpretation jsonb,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.sentinel_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  company_id uuid references public.sentinel_companies(id) on delete restrict,
  occurrence_id uuid references public.sentinel_occurrences(id) on delete set null,
  title text not null check (char_length(title) between 3 and 180),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','waiting','done','cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_name text,
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.sentinel_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  company_id uuid references public.sentinel_companies(id) on delete restrict,
  occurrence_id uuid references public.sentinel_occurrences(id) on delete set null,
  category text not null default 'evidence',
  name text not null check (char_length(name) between 1 and 200),
  source text not null default 'manual',
  storage_path text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  issued_at date,
  expires_at date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.sentinel_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  category text not null default 'task',
  title text not null,
  message text,
  severity text not null default 'attention' check (severity in ('regular','attention','relevant','critical','unknown')),
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.sentinel_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  code text not null,
  name text not null,
  environment text not null default 'configuration' check (environment in ('configuration','sandbox','production')),
  status text not null default 'configuration' check (status in ('operational','unstable','unavailable','configuration','unsupported','development')),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.sentinel_audit_events (
  id bigserial primary key,
  organization_id uuid not null references public.sentinel_organizations(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sentinel_memberships_user_idx on public.sentinel_memberships(user_id, status);
create index if not exists sentinel_companies_org_status_idx on public.sentinel_companies(organization_id, fiscal_status, updated_at desc) where deleted_at is null;
create index if not exists sentinel_occurrences_org_status_idx on public.sentinel_occurrences(organization_id, status, severity, due_at) where deleted_at is null;
create index if not exists sentinel_tasks_org_status_idx on public.sentinel_tasks(organization_id, status, due_at) where deleted_at is null;
create index if not exists sentinel_documents_org_company_idx on public.sentinel_documents(organization_id, company_id, created_at desc) where deleted_at is null;
create index if not exists sentinel_notifications_user_idx on public.sentinel_notifications(organization_id, user_id, read_at, created_at desc);
create index if not exists sentinel_audit_org_created_idx on public.sentinel_audit_events(organization_id, created_at desc);

create or replace function private.sentinel_is_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.sentinel_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function private.sentinel_is_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.sentinel_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('supervisor','admin')
  );
$$;

revoke all on function private.sentinel_is_member(uuid) from public, anon;
revoke all on function private.sentinel_is_admin(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.sentinel_is_member(uuid) to authenticated;
grant execute on function private.sentinel_is_admin(uuid) to authenticated;

alter table public.sentinel_organizations enable row level security;
alter table public.sentinel_memberships enable row level security;
alter table public.sentinel_companies enable row level security;
alter table public.sentinel_occurrences enable row level security;
alter table public.sentinel_tasks enable row level security;
alter table public.sentinel_documents enable row level security;
alter table public.sentinel_notifications enable row level security;
alter table public.sentinel_integrations enable row level security;
alter table public.sentinel_audit_events enable row level security;

alter table public.sentinel_organizations force row level security;
alter table public.sentinel_memberships force row level security;
alter table public.sentinel_companies force row level security;
alter table public.sentinel_occurrences force row level security;
alter table public.sentinel_tasks force row level security;
alter table public.sentinel_documents force row level security;
alter table public.sentinel_notifications force row level security;
alter table public.sentinel_integrations force row level security;
alter table public.sentinel_audit_events force row level security;

revoke all on public.sentinel_organizations, public.sentinel_memberships, public.sentinel_companies,
  public.sentinel_occurrences, public.sentinel_tasks, public.sentinel_documents,
  public.sentinel_notifications, public.sentinel_integrations, public.sentinel_audit_events
from public, anon, authenticated;

grant select on public.sentinel_organizations, public.sentinel_memberships, public.sentinel_companies,
  public.sentinel_occurrences, public.sentinel_tasks, public.sentinel_documents,
  public.sentinel_notifications, public.sentinel_integrations to authenticated;

create policy sentinel_organizations_select on public.sentinel_organizations for select to authenticated
using (private.sentinel_is_member(id));
create policy sentinel_memberships_select on public.sentinel_memberships for select to authenticated
using (private.sentinel_is_member(organization_id));
create policy sentinel_companies_select on public.sentinel_companies for select to authenticated
using (private.sentinel_is_member(organization_id));
create policy sentinel_occurrences_select on public.sentinel_occurrences for select to authenticated
using (private.sentinel_is_member(organization_id));
create policy sentinel_tasks_select on public.sentinel_tasks for select to authenticated
using (private.sentinel_is_member(organization_id));
create policy sentinel_documents_select on public.sentinel_documents for select to authenticated
using (private.sentinel_is_member(organization_id));
create policy sentinel_notifications_select on public.sentinel_notifications for select to authenticated
using (private.sentinel_is_member(organization_id) and (user_id is null or user_id = (select auth.uid())));
create policy sentinel_integrations_select on public.sentinel_integrations for select to authenticated
using (private.sentinel_is_member(organization_id));

comment on table public.sentinel_companies is 'Empresas monitoradas pelo Luce Sentinela, isoladas por organizacao.';
comment on table public.sentinel_integrations is 'Matriz real de integracoes; status configuration nunca deve ser exibido como operacional.';
