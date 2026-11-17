-- CERNE + Onboarding: shared identity, owner isolation and idempotent intake.
-- Apply through the controlled Supabase migration pipeline.

create or replace function public.is_luce_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
     and coalesce((auth.jwt() -> 'app_metadata' ->> 'status') <> 'pending', true);
$$;

revoke all on function public.is_luce_admin() from public, anon;
grant execute on function public.is_luce_admin() to authenticated;

create table if not exists public.cerne_clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  company text not null check (char_length(company) between 2 and 180),
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  city text,
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  tax_regime text,
  segment text,
  unit text,
  consultant text,
  channel text,
  monthly_fee numeric(14,2) not null default 0 check (monthly_fee >= 0),
  employees integer not null default 0 check (employees >= 0),
  status text not null default 'active' check (status in ('active','inactive')),
  entry_date date not null default current_date,
  source_document_id uuid references public.onboarding_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cnpj)
);

create index if not exists cerne_clients_owner_status_idx
  on public.cerne_clients (owner_id, status, updated_at desc);

alter table public.cerne_clients enable row level security;
alter table public.cerne_clients force row level security;
revoke all on public.cerne_clients from public, anon;
grant select, insert, update on public.cerne_clients to authenticated;

drop policy if exists cerne_clients_select on public.cerne_clients;
create policy cerne_clients_select on public.cerne_clients for select to authenticated
using (owner_id = auth.uid() or public.is_luce_admin());

drop policy if exists cerne_clients_insert on public.cerne_clients;
create policy cerne_clients_insert on public.cerne_clients for insert to authenticated
with check (
  created_by = auth.uid()
  and (owner_id = auth.uid() or public.is_luce_admin())
);

drop policy if exists cerne_clients_update on public.cerne_clients;
create policy cerne_clients_update on public.cerne_clients for update to authenticated
using (owner_id = auth.uid() or public.is_luce_admin())
with check (owner_id = auth.uid() or public.is_luce_admin());

create table if not exists public.cerne_onboarding_queue (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.onboarding_documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('entry','exit')),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  payload jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  accepted_client_id uuid references public.cerne_clients(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_document_id, event_type)
);

create index if not exists cerne_queue_owner_status_idx
  on public.cerne_onboarding_queue (owner_id, status, created_at desc);

alter table public.cerne_onboarding_queue enable row level security;
alter table public.cerne_onboarding_queue force row level security;
revoke all on public.cerne_onboarding_queue from public, anon, authenticated;
grant select, update on public.cerne_onboarding_queue to authenticated;

drop policy if exists cerne_queue_select on public.cerne_onboarding_queue;
create policy cerne_queue_select on public.cerne_onboarding_queue for select to authenticated
using (owner_id = auth.uid() or public.is_luce_admin());

drop policy if exists cerne_queue_update on public.cerne_onboarding_queue;
create policy cerne_queue_update on public.cerne_onboarding_queue for update to authenticated
using (owner_id = auth.uid() or public.is_luce_admin())
with check (
  (owner_id = auth.uid() or public.is_luce_admin())
  and reviewed_by = auth.uid()
);

create or replace function public.enqueue_cerne_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  briefing_type text;
  event_kind text;
begin
  if new.status <> 'final' or new.kind <> 'briefing' then
    return new;
  end if;

  briefing_type := upper(coalesce(
    new.form_state #>> '{fields,tipoBriefing}',
    new.form_state #>> '{fields,tipoBriefingSecao}',
    new.procedimento,
    new.title,
    ''
  ));

  event_kind := case
    when briefing_type like '%BAIXA%' or briefing_type like '%SAÍDA%' or briefing_type like '%SAIDA%' then 'exit'
    else 'entry'
  end;

  insert into public.cerne_onboarding_queue
    (source_document_id, owner_id, event_type, payload)
  values
    (new.id, new.owner_id, event_kind,
      jsonb_build_object(
        'empresa', new.empresa,
        'documento', new.documento,
        'procedimento', new.procedimento,
        'serial', new.serial,
        'form_state', new.form_state
      )
    )
  on conflict (source_document_id, event_type) do update
    set payload = excluded.payload, owner_id = excluded.owner_id;

  return new;
end;
$$;

revoke all on function public.enqueue_cerne_onboarding() from public, anon, authenticated;

drop trigger if exists onboarding_to_cerne_queue on public.onboarding_documents;
create trigger onboarding_to_cerne_queue
after insert or update of status, form_state, empresa, documento, procedimento
on public.onboarding_documents
for each row execute function public.enqueue_cerne_onboarding();
