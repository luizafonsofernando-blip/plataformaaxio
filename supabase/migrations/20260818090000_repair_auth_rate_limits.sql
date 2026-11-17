-- Repair auth rate-limit schema used by onboarding registration/login.
-- This migration is intentionally non-destructive: it only adds the columns
-- expected by the current API and refreshes the RPC implementation.

create table if not exists public.auth_rate_limits (
  key_hash text not null,
  action text not null
);

alter table public.auth_rate_limits
  add column if not exists window_start timestamptz not null default now();

alter table public.auth_rate_limits
  add column if not exists attempt_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.auth_rate_limits'::regclass
      and conname = 'auth_rate_limits_pkey'
  ) then
    alter table public.auth_rate_limits
      add constraint auth_rate_limits_pkey primary key (key_hash, action);
  end if;
end;
$$;

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
