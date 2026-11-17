create table if not exists public.auth_rate_limits (
  key_hash text not null,
  action text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1,
  primary key (key_hash, action)
);
create table if not exists public.security_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  target_id text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb
);
alter table public.auth_rate_limits enable row level security;
alter table public.security_audit_log enable row level security;
revoke all on table public.auth_rate_limits from anon, authenticated;
revoke all on table public.security_audit_log from anon;
grant select on table public.security_audit_log to authenticated;
grant insert on table public.security_audit_log to service_role;
grant usage, select on sequence public.security_audit_log_id_seq to service_role;
drop policy if exists "Approved admins can read security audit" on public.security_audit_log;
create policy "Approved admins can read security audit"
on public.security_audit_log for select
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  and auth.jwt() -> 'app_metadata' ->> 'status' = 'approved'
);
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
  current_attempts integer;
begin
  if length(p_key_hash) < 32 or p_limit < 1 or p_window_seconds < 60 then
    return false;
  end if;

  insert into public.auth_rate_limits (key_hash, action, window_started_at, attempts)
  values (p_key_hash, left(p_action, 40), now(), 1)
  on conflict (key_hash, action) do update
  set attempts = case
        when auth_rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds) then 1
        else auth_rate_limits.attempts + 1
      end,
      window_started_at = case
        when auth_rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds) then now()
        else auth_rate_limits.window_started_at
      end
  returning attempts into current_attempts;

  return current_attempts <= p_limit;
end;
$$;
revoke all on function public.check_auth_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_auth_rate_limit(text, text, integer, integer) to service_role;
create or replace function public.audit_onboarding_document_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_id uuid;
  affected_owner uuid;
begin
  affected_id := coalesce(new.id, old.id);
  affected_owner := coalesce(new.owner_id, old.owner_id);
  insert into public.security_audit_log (actor_id, event_type, target_id, metadata)
  values (
    auth.uid(),
    'document_' || lower(tg_op),
    affected_id::text,
    jsonb_build_object('owner_id', affected_owner, 'table', tg_table_name)
  );
  return coalesce(new, old);
end;
$$;
drop trigger if exists audit_onboarding_document_change on public.onboarding_documents;
create trigger audit_onboarding_document_change
after insert or update or delete on public.onboarding_documents
for each row execute function public.audit_onboarding_document_change();
create index if not exists security_audit_created_idx on public.security_audit_log (created_at desc);
create index if not exists security_audit_actor_idx on public.security_audit_log (actor_id, created_at desc);
