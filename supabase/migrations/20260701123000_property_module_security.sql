-- Axion Property module storage boundary.
-- API/Edge Functions should read and write this table with the service role.
-- Direct browser table access remains blocked by RLS.

create table if not exists public.property_module_state (
  entity_id text primary key,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists property_module_state_updated_idx
  on public.property_module_state (updated_at desc);

alter table public.property_module_state enable row level security;
alter table public.property_module_state force row level security;
revoke all on public.property_module_state from anon, authenticated;
