-- Security hardening for Plataforma Axio.
-- Run in Supabase SQL editor or through `supabase db push`.
-- The frontend must use Edge Functions; direct table access is intentionally denied.

create table if not exists public.onboarding_documents (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  serial text,
  emitente text,
  kind text,
  status text not null default 'final' check (status in ('rascunho', 'final')),
  title text,
  empresa text,
  documento text,
  procedimento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  form_state jsonb not null default '{}'::jsonb,
  html text not null default ''
);

alter table public.onboarding_documents add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.onboarding_documents add column if not exists serial text;
alter table public.onboarding_documents add column if not exists emitente text;
alter table public.onboarding_documents add column if not exists kind text;
alter table public.onboarding_documents add column if not exists status text not null default 'final';
alter table public.onboarding_documents add column if not exists title text;
alter table public.onboarding_documents add column if not exists empresa text;
alter table public.onboarding_documents add column if not exists documento text;
alter table public.onboarding_documents add column if not exists procedimento text;
alter table public.onboarding_documents add column if not exists created_at timestamptz not null default now();
alter table public.onboarding_documents add column if not exists updated_at timestamptz not null default now();
alter table public.onboarding_documents add column if not exists form_state jsonb not null default '{}'::jsonb;
alter table public.onboarding_documents add column if not exists html text not null default '';

create index if not exists onboarding_documents_owner_updated_idx
  on public.onboarding_documents (owner_id, updated_at desc);

alter table public.onboarding_documents enable row level security;
alter table public.onboarding_documents force row level security;
revoke all on public.onboarding_documents from anon, authenticated;

create table if not exists public.security_audit_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  target_id text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists security_audit_log_created_idx
  on public.security_audit_log (created_at desc);

create index if not exists security_audit_log_actor_idx
  on public.security_audit_log (actor_id, created_at desc);

alter table public.security_audit_log enable row level security;
alter table public.security_audit_log force row level security;
revoke all on public.security_audit_log from anon, authenticated;

create table if not exists public.auth_rate_limits (
  key_hash text not null,
  action text not null,
  window_start timestamptz not null default now(),
  attempt_count integer not null default 0,
  primary key (key_hash, action)
);

alter table public.auth_rate_limits enable row level security;
alter table public.auth_rate_limits force row level security;
revoke all on public.auth_rate_limits from anon, authenticated;

create or replace function public.check_auth_rate_limit(
  p_key_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_attempt_count integer;
begin
  if p_key_hash is null or length(p_key_hash) < 16 or
     p_action is null or length(p_action) < 2 or
     p_limit < 1 or p_window_seconds < 60 then
    return false;
  end if;

  insert into public.auth_rate_limits as rl (key_hash, action, window_start, attempt_count)
  values (p_key_hash, p_action, v_now, 1)
  on conflict (key_hash, action) do update
    set
      window_start = case
        when rl.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
        else rl.window_start
      end,
      attempt_count = case
        when rl.window_start < v_now - make_interval(secs => p_window_seconds) then 1
        else rl.attempt_count + 1
      end
  returning window_start, attempt_count into v_window_start, v_attempt_count;

  return v_attempt_count <= p_limit;
end;
$$;

revoke all on function public.check_auth_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_auth_rate_limit(text, text, integer, integer) to service_role;
