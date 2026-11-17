create table if not exists public.onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  serial text not null,
  emitente text,
  kind text not null check (kind in ('briefing', 'contrato', 'distrato')),
  status text not null default 'final' check (status in ('final', 'rascunho')),
  title text,
  empresa text,
  documento text,
  procedimento text,
  form_state jsonb not null default '{}'::jsonb,
  html text not null default ''
);
alter table public.onboarding_documents enable row level security;
create index if not exists onboarding_documents_owner_updated_idx
  on public.onboarding_documents (owner_id, updated_at desc);
create index if not exists onboarding_documents_serial_idx
  on public.onboarding_documents (serial);
create or replace function public.set_onboarding_document_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists set_onboarding_document_updated_at on public.onboarding_documents;
create trigger set_onboarding_document_updated_at
before update on public.onboarding_documents
for each row execute function public.set_onboarding_document_updated_at();
drop policy if exists "Users can read their onboarding documents" on public.onboarding_documents;
create policy "Users can read their onboarding documents"
on public.onboarding_documents for select
to authenticated
using (
  owner_id = auth.uid()
  or (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'status' = 'approved'
  )
);
drop policy if exists "Users can create their onboarding documents" on public.onboarding_documents;
create policy "Users can create their onboarding documents"
on public.onboarding_documents for insert
to authenticated
with check (owner_id = auth.uid());
drop policy if exists "Users can update their onboarding documents" on public.onboarding_documents;
create policy "Users can update their onboarding documents"
on public.onboarding_documents for update
to authenticated
using (
  owner_id = auth.uid()
  or (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'status' = 'approved'
  )
)
with check (owner_id = auth.uid());
drop policy if exists "Users can delete their onboarding documents" on public.onboarding_documents;
create policy "Users can delete their onboarding documents"
on public.onboarding_documents for delete
to authenticated
using (
  owner_id = auth.uid()
  or (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'status' = 'approved'
  )
);
revoke all on table public.onboarding_documents from anon;
grant select, insert, update, delete on table public.onboarding_documents to authenticated;
