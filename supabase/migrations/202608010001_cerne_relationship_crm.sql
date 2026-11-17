-- CERNE Relacionamento: CRM comercial integrado.

create table if not exists public.cerne_crm_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  position integer not null default 0,
  color text not null default '#1f5fbf',
  active boolean not null default true,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

insert into public.cerne_crm_stages (name, position, color, locked)
values
  ('Novo contato', 1, '#2563eb', true),
  ('Qualificação', 2, '#0f766e', true),
  ('Reunião agendada', 3, '#7c3aed', true),
  ('Proposta em elaboração', 4, '#b45309', true),
  ('Proposta enviada', 5, '#0891b2', true),
  ('Negociação', 6, '#ca8a04', true),
  ('Contrato enviado', 7, '#4f46e5', true),
  ('Contrato assinado', 8, '#16a34a', true),
  ('Cliente ativo', 9, '#15803d', true),
  ('Perdido', 10, '#dc2626', true)
on conflict (name) do nothing;

create table if not exists public.cerne_crm_origins (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.cerne_crm_origins (name)
values ('Indicação'), ('Site'), ('WhatsApp'), ('Prospecção ativa'), ('Cliente atual'), ('Evento'), ('Outro')
on conflict (name) do nothing;

create table if not exists public.cerne_crm_services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.cerne_crm_services (name)
values ('Contabilidade'), ('Departamento pessoal'), ('Fiscal'), ('BPO financeiro'), ('Abertura de empresa'), ('Consultoria'), ('Outro')
on conflict (name) do nothing;

create table if not exists public.cerne_crm_loss_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.cerne_crm_loss_reasons (name)
values ('Preço'), ('Ausência de retorno'), ('Contratação de concorrente'), ('Desistência'), ('Serviço incompatível'), ('Negociação adiada'), ('Contato inválido'), ('Outro')
on conflict (name) do nothing;

create table if not exists public.cerne_crm_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  type text not null default 'pj' check (type in ('pf','pj')),
  name text not null check (char_length(name) between 2 and 180),
  trade_name text,
  document text,
  phone text,
  whatsapp text,
  email text,
  city text,
  state text,
  address text,
  main_contact text,
  role_title text,
  origin text,
  services text[] not null default '{}',
  internal_owner text,
  notes text,
  status text not null default 'prospect' check (status in ('prospect','opportunity','active','inactive','lost')),
  inactive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cerne_crm_contacts_document_unique
  on public.cerne_crm_contacts (document) where document is not null and document <> '';
create index if not exists cerne_crm_contacts_owner_idx on public.cerne_crm_contacts (owner_id, updated_at desc);

create table if not exists public.cerne_crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete restrict,
  contact_id uuid not null references public.cerne_crm_contacts(id) on delete restrict,
  stage_id uuid not null references public.cerne_crm_stages(id) on delete restrict,
  title text not null check (char_length(title) between 2 and 180),
  service_interest text,
  responsible text,
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  probability integer not null default 20 check (probability between 0 and 100),
  expected_close date,
  priority text not null default 'media' check (priority in ('baixa','media','alta','urgente')),
  origin text,
  description text,
  need_reason text,
  competitors text,
  next_step text,
  next_return_at timestamptz,
  status text not null default 'open' check (status in ('open','won','lost')),
  final_value numeric(14,2),
  closed_at date,
  contracted_services text,
  closed_by text,
  loss_reason text,
  loss_notes text,
  stage_changed_at timestamptz not null default now(),
  last_interaction_at timestamptz,
  inactive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cerne_crm_opportunities_owner_idx on public.cerne_crm_opportunities (owner_id, updated_at desc);
create index if not exists cerne_crm_opportunities_stage_idx on public.cerne_crm_opportunities (stage_id, status);

create table if not exists public.cerne_crm_activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  contact_id uuid references public.cerne_crm_contacts(id) on delete restrict,
  opportunity_id uuid references public.cerne_crm_opportunities(id) on delete restrict,
  type text not null,
  activity_at timestamptz not null default now(),
  responsible text,
  description text not null,
  result text,
  next_action text,
  next_contact_at timestamptz,
  attachments jsonb not null default '[]'::jsonb,
  inactive boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.cerne_crm_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  contact_id uuid references public.cerne_crm_contacts(id) on delete restrict,
  opportunity_id uuid references public.cerne_crm_opportunities(id) on delete restrict,
  title text not null,
  responsible text,
  due_at timestamptz not null,
  priority text not null default 'media' check (priority in ('baixa','media','alta','urgente')),
  status text not null default 'pendente' check (status in ('pendente','em_andamento','concluida','vencida','cancelada')),
  notes text,
  inactive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cerne_crm_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  contact_id uuid not null references public.cerne_crm_contacts(id) on delete restrict,
  opportunity_id uuid not null references public.cerne_crm_opportunities(id) on delete restrict,
  number text not null,
  services text,
  setup_value numeric(14,2) not null default 0,
  recurring_value numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  valid_until date,
  payment_terms text,
  notes text,
  responsible text,
  status text not null default 'rascunho' check (status in ('rascunho','em_elaboracao','enviada','visualizada','em_negociacao','aprovada','recusada','vencida','cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cerne_crm_proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.cerne_crm_proposals(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_value numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cerne_crm_contracts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  contact_id uuid not null references public.cerne_crm_contacts(id) on delete restrict,
  opportunity_id uuid references public.cerne_crm_opportunities(id) on delete restrict,
  proposal_id uuid references public.cerne_crm_proposals(id) on delete restrict,
  service_contracted text,
  initial_value numeric(14,2) not null default 0,
  monthly_value numeric(14,2) not null default 0,
  sent_at date,
  signed_at date,
  term text,
  responsible text,
  document_link text,
  notes text,
  status text not null default 'em_elaboracao' check (status in ('em_elaboracao','enviado','aguardando_assinatura','assinado','recusado','cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cerne_crm_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  entity text not null,
  entity_id uuid not null,
  event_type text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cerne_crm_history_entity_idx on public.cerne_crm_history (entity, entity_id, created_at desc);

alter table public.cerne_crm_stages enable row level security;
alter table public.cerne_crm_origins enable row level security;
alter table public.cerne_crm_services enable row level security;
alter table public.cerne_crm_loss_reasons enable row level security;
alter table public.cerne_crm_contacts enable row level security;
alter table public.cerne_crm_opportunities enable row level security;
alter table public.cerne_crm_activities enable row level security;
alter table public.cerne_crm_tasks enable row level security;
alter table public.cerne_crm_proposals enable row level security;
alter table public.cerne_crm_proposal_items enable row level security;
alter table public.cerne_crm_contracts enable row level security;
alter table public.cerne_crm_history enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'cerne_crm_stages','cerne_crm_origins','cerne_crm_services','cerne_crm_loss_reasons',
    'cerne_crm_contacts','cerne_crm_opportunities','cerne_crm_activities','cerne_crm_tasks',
    'cerne_crm_proposals','cerne_crm_proposal_items','cerne_crm_contracts','cerne_crm_history'
  ] loop
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

grant delete on public.cerne_crm_stages to authenticated;

create policy cerne_crm_stages_select on public.cerne_crm_stages for select to authenticated using (true);
create policy cerne_crm_admin_stages_write on public.cerne_crm_stages for all to authenticated using (public.is_luce_admin()) with check (public.is_luce_admin());
create policy cerne_crm_origins_select on public.cerne_crm_origins for select to authenticated using (true);
create policy cerne_crm_services_select on public.cerne_crm_services for select to authenticated using (true);
create policy cerne_crm_loss_reasons_select on public.cerne_crm_loss_reasons for select to authenticated using (true);

create policy cerne_crm_contacts_select on public.cerne_crm_contacts for select to authenticated using (owner_id = auth.uid() or public.is_luce_admin());
create policy cerne_crm_contacts_insert on public.cerne_crm_contacts for insert to authenticated with check (created_by = auth.uid() and (owner_id = auth.uid() or public.is_luce_admin()));
create policy cerne_crm_contacts_update on public.cerne_crm_contacts for update to authenticated using (owner_id = auth.uid() or public.is_luce_admin()) with check (owner_id = auth.uid() or public.is_luce_admin());

create policy cerne_crm_opportunities_select on public.cerne_crm_opportunities for select to authenticated using (owner_id = auth.uid() or public.is_luce_admin());
create policy cerne_crm_opportunities_insert on public.cerne_crm_opportunities for insert to authenticated with check (created_by = auth.uid() and (owner_id = auth.uid() or public.is_luce_admin()));
create policy cerne_crm_opportunities_update on public.cerne_crm_opportunities for update to authenticated using (owner_id = auth.uid() or public.is_luce_admin()) with check (owner_id = auth.uid() or public.is_luce_admin());

create policy cerne_crm_activities_select on public.cerne_crm_activities for select to authenticated using (owner_id = auth.uid() or public.is_luce_admin());
create policy cerne_crm_activities_insert on public.cerne_crm_activities for insert to authenticated with check (created_by = auth.uid() and (owner_id = auth.uid() or public.is_luce_admin()));
create policy cerne_crm_activities_update on public.cerne_crm_activities for update to authenticated using (owner_id = auth.uid() or public.is_luce_admin()) with check (owner_id = auth.uid() or public.is_luce_admin());

create policy cerne_crm_tasks_select on public.cerne_crm_tasks for select to authenticated using (owner_id = auth.uid() or public.is_luce_admin());
create policy cerne_crm_tasks_insert on public.cerne_crm_tasks for insert to authenticated with check (created_by = auth.uid() and (owner_id = auth.uid() or public.is_luce_admin()));
create policy cerne_crm_tasks_update on public.cerne_crm_tasks for update to authenticated using (owner_id = auth.uid() or public.is_luce_admin()) with check (owner_id = auth.uid() or public.is_luce_admin());

create policy cerne_crm_proposals_select on public.cerne_crm_proposals for select to authenticated using (owner_id = auth.uid() or public.is_luce_admin());
create policy cerne_crm_proposals_insert on public.cerne_crm_proposals for insert to authenticated with check (created_by = auth.uid() and (owner_id = auth.uid() or public.is_luce_admin()));
create policy cerne_crm_proposals_update on public.cerne_crm_proposals for update to authenticated using (owner_id = auth.uid() or public.is_luce_admin()) with check (owner_id = auth.uid() or public.is_luce_admin());

create policy cerne_crm_contracts_select on public.cerne_crm_contracts for select to authenticated using (owner_id = auth.uid() or public.is_luce_admin());
create policy cerne_crm_contracts_insert on public.cerne_crm_contracts for insert to authenticated with check (created_by = auth.uid() and (owner_id = auth.uid() or public.is_luce_admin()));
create policy cerne_crm_contracts_update on public.cerne_crm_contracts for update to authenticated using (owner_id = auth.uid() or public.is_luce_admin()) with check (owner_id = auth.uid() or public.is_luce_admin());

create policy cerne_crm_history_select on public.cerne_crm_history for select to authenticated using (owner_id = auth.uid() or public.is_luce_admin());
create policy cerne_crm_history_insert on public.cerne_crm_history for insert to authenticated with check (actor_id = auth.uid());
