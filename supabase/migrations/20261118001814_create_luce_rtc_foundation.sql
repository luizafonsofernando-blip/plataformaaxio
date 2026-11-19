-- Luce RTC: isolated tenant and company data. No existing table is changed.
create table public.rtc_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rtc_memberships (
  organization_id uuid not null references public.rtc_organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('admin', 'analyst', 'viewer')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index rtc_memberships_user_idx on public.rtc_memberships (user_id, status);

create function public.rtc_add_organization_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.rtc_memberships (organization_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;
revoke all on function public.rtc_add_organization_owner() from public, anon, authenticated;
create trigger rtc_organization_owner
  after insert on public.rtc_organizations
  for each row execute function public.rtc_add_organization_owner();

create table public.rtc_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rtc_organizations(id) on delete restrict,
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 180),
  trade_name text check (trade_name is null or char_length(trade_name) <= 180),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, cnpj),
  unique (id, organization_id)
);
create index rtc_companies_org_name_idx on public.rtc_companies (organization_id, legal_name);

create table public.rtc_company_access (
  company_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  granted_by uuid not null references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  primary key (company_id, user_id),
  foreign key (company_id, organization_id)
    references public.rtc_companies (id, organization_id) on delete restrict,
  foreign key (organization_id, user_id)
    references public.rtc_memberships (organization_id, user_id) on delete restrict
);
create index rtc_company_access_user_idx on public.rtc_company_access (user_id, organization_id);

create table public.rtc_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rtc_organizations(id) on delete restrict,
  company_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  operation_date date not null,
  engine text not null check (engine in ('regular', 'simples')),
  engine_version text not null check (char_length(engine_version) between 1 and 80),
  rules_version text not null check (char_length(rules_version) between 1 and 80),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  status text not null check (status in ('completed', 'failed', 'unsupported')),
  input_data jsonb not null check (jsonb_typeof(input_data) = 'object'),
  output_data jsonb not null check (jsonb_typeof(output_data) = 'object'),
  correlation_id uuid not null unique,
  created_at timestamptz not null default now(),
  foreign key (company_id, organization_id)
    references public.rtc_companies (id, organization_id) on delete restrict
);
create index rtc_analyses_company_time_idx on public.rtc_analyses (company_id, created_at desc);
create index rtc_analyses_org_time_idx on public.rtc_analyses (organization_id, created_at desc);
create index rtc_analyses_requester_idx on public.rtc_analyses (requested_by, created_at desc);

create table public.rtc_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rtc_organizations(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete restrict,
  analysis_id uuid references public.rtc_analyses(id) on delete restrict,
  event_type text not null check (char_length(btrim(event_type)) between 3 and 80),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index rtc_audit_events_org_time_idx on public.rtc_audit_events (organization_id, created_at desc);
create index rtc_audit_events_analysis_idx on public.rtc_audit_events (analysis_id, created_at);

create function public.rtc_reject_analysis_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'RTC analyses are immutable';
end;
$$;
revoke all on function public.rtc_reject_analysis_mutation() from public, anon, authenticated;
create trigger rtc_analyses_immutable
  before update or delete on public.rtc_analyses
  for each row execute function public.rtc_reject_analysis_mutation();

alter table public.rtc_organizations enable row level security;
alter table public.rtc_memberships enable row level security;
alter table public.rtc_companies enable row level security;
alter table public.rtc_company_access enable row level security;
alter table public.rtc_analyses enable row level security;
alter table public.rtc_audit_events enable row level security;

revoke all on public.rtc_organizations, public.rtc_memberships, public.rtc_companies,
  public.rtc_company_access, public.rtc_analyses, public.rtc_audit_events from anon, authenticated;
grant select on public.rtc_organizations, public.rtc_memberships, public.rtc_companies,
  public.rtc_company_access, public.rtc_analyses to authenticated;
grant select, insert, update, delete on public.rtc_organizations, public.rtc_memberships,
  public.rtc_companies, public.rtc_company_access to service_role;
grant select, insert on public.rtc_analyses, public.rtc_audit_events to service_role;

create policy rtc_memberships_self_select on public.rtc_memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy rtc_organizations_member_select on public.rtc_organizations
  for select to authenticated
  using (exists (
    select 1 from public.rtc_memberships m
    where m.organization_id = id and m.user_id = (select auth.uid()) and m.status = 'active'
  ));

create policy rtc_company_access_self_select on public.rtc_company_access
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy rtc_companies_allowed_select on public.rtc_companies
  for select to authenticated
  using (
    exists (
      select 1 from public.rtc_memberships m
      where m.organization_id = rtc_companies.organization_id
        and m.user_id = (select auth.uid()) and m.status = 'active' and m.role = 'admin'
    )
    or exists (
      select 1 from public.rtc_company_access a
      join public.rtc_memberships m
        on m.organization_id = a.organization_id and m.user_id = a.user_id
      where a.company_id = rtc_companies.id and a.user_id = (select auth.uid()) and m.status = 'active'
    )
  );

create policy rtc_analyses_allowed_select on public.rtc_analyses
  for select to authenticated
  using (exists (
    select 1 from public.rtc_companies c
    where c.id = rtc_analyses.company_id and c.organization_id = rtc_analyses.organization_id
  ));
