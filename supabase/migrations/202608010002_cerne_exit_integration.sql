-- CERNE + Onboarding: complete exit intake from final baixa/portabilidade documents.

alter table public.cerne_clients
  add column if not exists exit_date date,
  add column if not exists exit_reason text,
  add column if not exists lost_monthly_fee numeric(14,2) not null default 0 check (lost_monthly_fee >= 0),
  add column if not exists exit_source_document_id uuid references public.onboarding_documents(id) on delete set null,
  add column if not exists exit_payload jsonb not null default '{}'::jsonb;

create index if not exists cerne_clients_exit_date_idx
  on public.cerne_clients (exit_date desc)
  where status = 'inactive';

create table if not exists public.cerne_client_exits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.cerne_clients(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  source_document_id uuid references public.onboarding_documents(id) on delete set null,
  company text not null,
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  lost_monthly_fee numeric(14,2) not null default 0 check (lost_monthly_fee >= 0),
  exit_reason text,
  exit_date date not null default current_date,
  payload jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (source_document_id)
);

create index if not exists cerne_client_exits_owner_date_idx
  on public.cerne_client_exits (owner_id, exit_date desc);

alter table public.cerne_client_exits enable row level security;
alter table public.cerne_client_exits force row level security;
revoke all on public.cerne_client_exits from public, anon;
grant select, insert, update on public.cerne_client_exits to authenticated;

drop policy if exists cerne_client_exits_select on public.cerne_client_exits;
create policy cerne_client_exits_select on public.cerne_client_exits for select to authenticated
using (owner_id = auth.uid() or public.is_luce_admin());

drop policy if exists cerne_client_exits_insert on public.cerne_client_exits;
create policy cerne_client_exits_insert on public.cerne_client_exits for insert to authenticated
with check (owner_id = auth.uid() or public.is_luce_admin());

drop policy if exists cerne_client_exits_update on public.cerne_client_exits;
create policy cerne_client_exits_update on public.cerne_client_exits for update to authenticated
using (owner_id = auth.uid() or public.is_luce_admin())
with check (owner_id = auth.uid() or public.is_luce_admin());
