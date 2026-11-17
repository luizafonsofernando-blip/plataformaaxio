-- Auditoria complementar do estado centralizado do Luce Property.
-- A aplicação grava por API server-side usando service role.
-- Acesso direto pelo navegador permanece bloqueado por RLS.

create table if not exists public.property_module_audit (
  id bigserial primary key,
  entity_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  operation text not null,
  previous_updated_at timestamptz null,
  next_updated_at timestamptz null,
  user_agent text null,
  origin text null,
  created_at timestamptz not null default now()
);

create index if not exists property_module_audit_entity_created_idx
  on public.property_module_audit (entity_id, created_at desc);

create index if not exists property_module_audit_user_created_idx
  on public.property_module_audit (user_id, created_at desc);

alter table public.property_module_audit enable row level security;
alter table public.property_module_audit force row level security;
revoke all on public.property_module_audit from anon, authenticated;
