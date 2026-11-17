-- Complete the operational foundation for Luce Sentinela V1.
alter table public.sentinel_companies
  add column if not exists branch_type text check (branch_type is null or branch_type in ('headquarters','branch')),
  add column if not exists secondary_cnaes jsonb not null default '[]'::jsonb,
  add column if not exists address jsonb not null default '{}'::jsonb,
  add column if not exists postal_code text,
  add column if not exists activity_started_at date,
  add column if not exists registration_status text,
  add column if not exists contacts jsonb not null default '[]'::jsonb,
  add column if not exists department text,
  add column if not exists economic_group text,
  add column if not exists tags text[] not null default '{}';

alter table public.sentinel_tasks
  add column if not exists version integer not null default 1;

create table if not exists public.sentinel_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  occurrence_id uuid references public.sentinel_occurrences(id) on delete cascade,
  task_id uuid references public.sentinel_tasks(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (num_nonnulls(occurrence_id, task_id) = 1)
);

create table if not exists public.sentinel_fiscal_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  company_id uuid not null references public.sentinel_companies(id) on delete cascade,
  source_code text not null,
  source_name text not null,
  status text not null check (status in ('regular','attention','relevant','critical','not_checked','unavailable','stale')),
  official_data jsonb not null default '{}'::jsonb,
  source_reference text,
  checked_at timestamptz,
  valid_until timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, company_id, source_code, checked_at)
);

create table if not exists public.sentinel_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  company_id uuid not null references public.sentinel_companies(id) on delete cascade,
  snapshot_id uuid references public.sentinel_fiscal_snapshots(id) on delete set null,
  occurrence_id uuid references public.sentinel_occurrences(id) on delete set null,
  source_code text not null,
  title text not null,
  description text,
  obligation_code text,
  competence text,
  tax_code text,
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  due_at timestamptz,
  severity text not null default 'attention' check (severity in ('regular','attention','relevant','critical','unknown')),
  status text not null default 'open' check (status in ('open','treated','resolved','dismissed')),
  possible_action text,
  department text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  version integer not null default 1
);

create table if not exists public.sentinel_connector_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  company_id uuid references public.sentinel_companies(id) on delete cascade,
  connector_code text not null,
  operation text not null default 'check',
  status text not null default 'queued' check (status in ('queued','processing','retry','completed','failed','dead_letter','cancelled')),
  priority smallint not null default 5 check (priority between 1 and 9),
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  result_summary jsonb,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  scheduled_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, idempotency_key)
);

create table if not exists public.sentinel_job_attempts (
  id bigserial primary key,
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  job_id uuid not null references public.sentinel_connector_jobs(id) on delete cascade,
  attempt_number integer not null,
  status text not null check (status in ('started','completed','failed','timeout')),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (job_id, attempt_number)
);

create table if not exists public.sentinel_rule_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  event_type text not null,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  severity text not null default 'attention' check (severity in ('regular','attention','relevant','critical')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.sentinel_rule_executions (
  id bigserial primary key,
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  rule_id uuid not null references public.sentinel_rule_definitions(id) on delete cascade,
  company_id uuid references public.sentinel_companies(id) on delete cascade,
  matched boolean not null,
  input_data jsonb not null default '{}'::jsonb,
  actions_applied jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sentinel_feature_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sentinel_organizations(id) on delete cascade,
  code text not null,
  enabled boolean not null default false,
  rollout_percentage smallint not null default 0 check (rollout_percentage between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists sentinel_comments_occurrence_idx on public.sentinel_comments(organization_id, occurrence_id, created_at) where deleted_at is null;
create index if not exists sentinel_comments_task_idx on public.sentinel_comments(organization_id, task_id, created_at) where deleted_at is null;
create index if not exists sentinel_snapshots_company_idx on public.sentinel_fiscal_snapshots(organization_id, company_id, checked_at desc);
create index if not exists sentinel_findings_company_idx on public.sentinel_findings(organization_id, company_id, status, severity);
create index if not exists sentinel_jobs_queue_idx on public.sentinel_connector_jobs(status, scheduled_at, priority, created_at);
create index if not exists sentinel_job_attempts_job_idx on public.sentinel_job_attempts(job_id, attempt_number desc);
create index if not exists sentinel_rules_event_idx on public.sentinel_rule_definitions(organization_id, event_type, enabled);

alter table public.sentinel_comments enable row level security;
alter table public.sentinel_comments force row level security;
alter table public.sentinel_fiscal_snapshots enable row level security;
alter table public.sentinel_fiscal_snapshots force row level security;
alter table public.sentinel_findings enable row level security;
alter table public.sentinel_findings force row level security;
alter table public.sentinel_connector_jobs enable row level security;
alter table public.sentinel_connector_jobs force row level security;
alter table public.sentinel_job_attempts enable row level security;
alter table public.sentinel_job_attempts force row level security;
alter table public.sentinel_rule_definitions enable row level security;
alter table public.sentinel_rule_definitions force row level security;
alter table public.sentinel_rule_executions enable row level security;
alter table public.sentinel_rule_executions force row level security;
alter table public.sentinel_feature_flags enable row level security;
alter table public.sentinel_feature_flags force row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'sentinel_comments','sentinel_fiscal_snapshots','sentinel_findings','sentinel_connector_jobs',
    'sentinel_job_attempts','sentinel_rule_definitions','sentinel_rule_executions','sentinel_feature_flags'
  ] loop
    execute format('drop policy if exists sentinel_member_read on public.%I', table_name);
    execute format(
      'create policy sentinel_member_read on public.%I for select to authenticated using ((select private.sentinel_is_member(organization_id)))',
      table_name
    );
  end loop;
end
$$;

revoke all on public.sentinel_comments, public.sentinel_fiscal_snapshots, public.sentinel_findings,
  public.sentinel_connector_jobs, public.sentinel_job_attempts, public.sentinel_rule_definitions,
  public.sentinel_rule_executions, public.sentinel_feature_flags from anon;
grant select on public.sentinel_comments, public.sentinel_fiscal_snapshots, public.sentinel_findings,
  public.sentinel_connector_jobs, public.sentinel_job_attempts, public.sentinel_rule_definitions,
  public.sentinel_rule_executions, public.sentinel_feature_flags to authenticated;

insert into public.sentinel_rule_definitions (organization_id, code, name, description, event_type, conditions, actions, severity)
select id, 'deadline-overdue', 'Prazo vencido', 'Eleva a prioridade de itens com prazo vencido.', 'deadline_checked',
  '{"due_before_now":true}'::jsonb, '[{"type":"create_notification"}]'::jsonb, 'critical'
from public.sentinel_organizations
on conflict (organization_id, code) do nothing;

insert into public.sentinel_rule_definitions (organization_id, code, name, description, event_type, conditions, actions, severity)
select id, 'stale-source', 'Fonte desatualizada', 'Cria alerta quando a fonte fiscal ultrapassa sua validade.', 'snapshot_stale',
  '{"valid_until_before_now":true}'::jsonb, '[{"type":"create_notification"}]'::jsonb, 'attention'
from public.sentinel_organizations
on conflict (organization_id, code) do nothing;

insert into public.sentinel_feature_flags (organization_id, code, enabled, rollout_percentage, metadata)
select id, feature.code, false, 0, jsonb_build_object('reason', 'pending_credentials')
from public.sentinel_organizations
cross join (values ('federal-cnd'), ('federal-situation'), ('federal-mailbox'), ('dctfweb')) as feature(code)
on conflict (organization_id, code) do nothing;
