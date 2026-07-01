-- Axion Property - base de segurança para Supabase
-- Ajuste os nomes das tabelas conforme a modelagem definitiva.

create type public.app_role as enum ('admin', 'user');

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now()
);

create table if not exists public.user_entity_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, entity_id)
);

alter table public.user_profiles enable row level security;
alter table public.user_entity_access enable row level security;
alter table public.entities enable row level security;
alter table public.people enable row level security;
alter table public.properties enable row level security;
alter table public.contracts enable row level security;
alter table public.rent_payments enable row level security;
alter table public.receipts enable row level security;
alter table public.documents enable row level security;
alter table public.occurrences enable row level security;

create or replace function public.current_user_role()
returns public.app_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.user_profiles where id = auth.uid()
$$;

create or replace function public.can_access_entity(target_entity_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() = 'admin'
    or exists (
      select 1
      from public.user_entity_access access
      where access.user_id = auth.uid()
        and access.entity_id = target_entity_id
    )
$$;

create policy "profiles_select_own_or_admin"
on public.user_profiles
for select
using (id = auth.uid() or public.current_user_role() = 'admin');

create policy "entity_access_select_own_or_admin"
on public.user_entity_access
for select
using (user_id = auth.uid() or public.current_user_role() = 'admin');

create policy "entities_by_role"
on public.entities
for select
using (public.current_user_role() = 'admin' or public.can_access_entity(id));

create policy "people_by_entity"
on public.people
for all
using (public.can_access_entity(entity_id))
with check (public.can_access_entity(entity_id));

create policy "properties_by_entity"
on public.properties
for all
using (public.can_access_entity(entity_id))
with check (public.can_access_entity(entity_id));

create policy "contracts_by_entity"
on public.contracts
for all
using (public.can_access_entity(entity_id))
with check (public.can_access_entity(entity_id));

create policy "rent_payments_by_entity"
on public.rent_payments
for all
using (public.can_access_entity(entity_id))
with check (public.can_access_entity(entity_id));

create policy "receipts_by_entity"
on public.receipts
for all
using (public.can_access_entity(entity_id))
with check (public.can_access_entity(entity_id));

create policy "documents_by_entity"
on public.documents
for all
using (public.can_access_entity(entity_id))
with check (public.can_access_entity(entity_id));

create policy "occurrences_by_entity"
on public.occurrences
for all
using (public.can_access_entity(entity_id))
with check (public.can_access_entity(entity_id));

-- Exemplo de configuração:
-- Admin: inserir em user_profiles com role = 'admin'.
-- Usuário comum: inserir em user_profiles com role = 'user' e criar acessos
-- em user_entity_access apenas para Orteconte e São Cipriano.
