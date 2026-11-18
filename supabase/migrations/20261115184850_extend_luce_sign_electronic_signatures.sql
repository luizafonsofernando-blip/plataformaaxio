alter table public.sign_documents
  add column if not exists verification_code text unique,
  add column if not exists final_path text,
  add column if not exists final_sha256 text,
  add column if not exists evidence_path text,
  add column if not exists evidence_sha256 text,
  add column if not exists completed_at timestamptz,
  add column if not exists finalizing_at timestamptz;

alter table public.sign_documents
  add constraint sign_final_complete check (
    (final_path is null and final_sha256 is null and evidence_path is null and evidence_sha256 is null)
    or (final_path is not null and final_sha256 ~ '^[a-f0-9]{64}$'
      and evidence_path is not null and evidence_sha256 ~ '^[a-f0-9]{64}$')
  );

alter table public.sign_signers
  add column if not exists link_nonce text,
  add column if not exists link_hash text,
  add column if not exists link_expires_at timestamptz,
  add column if not exists invite_sent_at timestamptz,
  add column if not exists otp_nonce text,
  add column if not exists otp_hash text,
  add column if not exists otp_expires_at timestamptz,
  add column if not exists otp_issued_at timestamptz,
  add column if not exists otp_attempts integer not null default 0,
  add column if not exists otp_send_count integer not null default 0,
  add column if not exists otp_counter_date date,
  add column if not exists otp_verified_at timestamptz,
  add column if not exists session_hash text,
  add column if not exists session_expires_at timestamptz,
  add column if not exists consent_version text,
  add column if not exists consented_at timestamptz,
  add column if not exists signature_text text,
  add column if not exists signed_at timestamptz;

create unique index if not exists sign_signers_link_hash_key
  on public.sign_signers (link_hash) where link_hash is not null;
create unique index if not exists sign_signers_session_hash_key
  on public.sign_signers (session_hash) where session_hash is not null;

alter table public.sign_signers
  add constraint sign_signers_identity_scope_key unique (id, document_id, organization_id);

create table if not exists public.sign_fields (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  organization_id uuid not null references public.sign_organizations(id) on delete restrict,
  signer_id uuid not null,
  page_number integer not null check (page_number between 1 and 500),
  x numeric(7,6) not null check (x between 0 and 1),
  y numeric(7,6) not null check (y between 0 and 1),
  width numeric(7,6) not null check (width > 0 and width <= 1),
  height numeric(7,6) not null check (height > 0 and height <= 1),
  created_at timestamptz not null default now(),
  unique (signer_id),
  foreign key (document_id, organization_id)
    references public.sign_documents(id, organization_id) on delete restrict,
  foreign key (signer_id, document_id, organization_id)
    references public.sign_signers(id, document_id, organization_id) on delete restrict,
  check (x + width <= 1 and y + height <= 1)
);

create index if not exists sign_fields_document_idx on public.sign_fields (document_id);

create table if not exists public.sign_rate_limits (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  count integer not null default 0 check (count >= 0),
  window_ends_at timestamptz not null
);

alter table public.sign_fields enable row level security;
alter table public.sign_rate_limits enable row level security;
revoke all on public.sign_fields, public.sign_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.sign_fields, public.sign_rate_limits to service_role;

create or replace function public.sign_take_rate_limit(
  p_key_hash text, p_limit integer, p_window_seconds integer
) returns boolean language plpgsql security invoker as $$
declare v_count integer;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 1000
     or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit parameters';
  end if;
  insert into public.sign_rate_limits (key_hash, count, window_ends_at)
  values (p_key_hash, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key_hash) do update set
    count = case when sign_rate_limits.window_ends_at <= now() then 1
      else sign_rate_limits.count + 1 end,
    window_ends_at = case when sign_rate_limits.window_ends_at <= now()
      then now() + make_interval(secs => p_window_seconds)
      else sign_rate_limits.window_ends_at end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

revoke all on function public.sign_take_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.sign_take_rate_limit(text, integer, integer) to service_role;

alter table public.sign_events
  add column if not exists event_index integer,
  add column if not exists previous_hash text,
  add column if not exists event_hash text,
  add column if not exists signer_id uuid references public.sign_signers(id),
  add column if not exists ip_address inet,
  add column if not exists user_agent text;

alter table public.sign_events
  add constraint sign_events_signer_scope_fk
    foreign key (signer_id, document_id, organization_id)
    references public.sign_signers(id, document_id, organization_id) on delete restrict;

create unique index if not exists sign_events_document_index_key
  on public.sign_events (document_id, event_index) where event_index is not null;

create or replace function public.sign_chain_event()
returns trigger language plpgsql as $$
declare v_previous public.sign_events%rowtype;
begin
  perform 1 from public.sign_documents where id = new.document_id for update;
  select * into v_previous from public.sign_events
    where document_id = new.document_id order by event_index desc nulls last limit 1;
  new.event_index := coalesce(v_previous.event_index, 0) + 1;
  new.previous_hash := coalesce(v_previous.event_hash, repeat('0', 64));
  new.event_hash := encode(extensions.digest(
    new.id::text || '|' || new.document_id::text || '|' || new.organization_id::text || '|' ||
    coalesce(new.actor_id::text, '') || '|' || coalesce(new.signer_id::text, '') || '|' ||
    new.event_index::text || '|' ||
    new.previous_hash || '|' || new.event_type || '|' ||
    to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
    new.details::text || '|' ||
    coalesce(new.ip_address::text, '') || '|' || coalesce(new.user_agent, ''),
    'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists sign_events_chain on public.sign_events;
create trigger sign_events_chain before insert on public.sign_events
  for each row execute function public.sign_chain_event();

create or replace function public.sign_protect_original_pdf()
returns trigger language plpgsql as $$
begin
  if old.original_path is not null and
     (old.original_path, old.original_sha256, old.original_size, old.page_count)
       is distinct from
     (new.original_path, new.original_sha256, new.original_size, new.page_count) then
    raise exception 'Original PDF is immutable';
  end if;
  if old.final_path is not null and
     (old.final_path, old.final_sha256, old.evidence_path, old.evidence_sha256)
       is distinct from
     (new.final_path, new.final_sha256, new.evidence_path, new.evidence_sha256) then
    raise exception 'Final artifacts are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.sign_accept_signature(
  p_signer_id uuid, p_session_hash text, p_signature_text text,
  p_consent_version text, p_ip_address inet, p_user_agent text
) returns boolean language plpgsql security invoker as $$
declare
  v_signer public.sign_signers%rowtype;
  v_document public.sign_documents%rowtype;
  v_remaining integer;
begin
  select * into v_signer from public.sign_signers where id = p_signer_id;
  if not found then return false; end if;
  select * into v_document from public.sign_documents where id = v_signer.document_id for update;
  select * into v_signer from public.sign_signers where id = p_signer_id for update;
  if v_signer.session_hash is distinct from p_session_hash
     or v_signer.session_expires_at is null
     or v_signer.session_expires_at <= now()
     or v_signer.status not in ('authenticated', 'viewed')
     or v_document.status not in ('sent', 'viewed', 'partially_signed')
     or length(btrim(p_signature_text)) not between 2 and 160
     or p_consent_version <> 'v1' then return false; end if;
  update public.sign_signers set status = 'signed', consent_version = p_consent_version,
    consented_at = now(), signature_text = p_signature_text, signed_at = now(),
    updated_at = now()
    where id = p_signer_id;
  select count(*) into v_remaining from public.sign_signers
    where document_id = v_signer.document_id and status <> 'signed';
  update public.sign_documents set status = 'partially_signed', updated_at = now()
    where id = v_signer.document_id;
  insert into public.sign_events
    (document_id, organization_id, signer_id, event_type, details, ip_address, user_agent)
    values (v_signer.document_id, v_signer.organization_id, p_signer_id, 'signer.signed',
      jsonb_build_object('consent_version', p_consent_version, 'remaining', v_remaining),
      p_ip_address, left(p_user_agent, 500));
  return true;
end;
$$;

revoke all on function public.sign_accept_signature(uuid, text, text, text, inet, text)
  from public, anon, authenticated;
grant execute on function public.sign_accept_signature(uuid, text, text, text, inet, text)
  to service_role;

create or replace function public.sign_verify_otp(
  p_signer_id uuid, p_otp_hash text, p_session_hash text,
  p_ip_address inet, p_user_agent text
) returns boolean language plpgsql security invoker as $$
declare v_signer public.sign_signers%rowtype;
begin
  select * into v_signer from public.sign_signers where id = p_signer_id;
  if not found then return false; end if;
  perform 1 from public.sign_documents where id = v_signer.document_id for update;
  select * into v_signer from public.sign_signers where id = p_signer_id for update;
  if v_signer.otp_hash is distinct from p_otp_hash
    or v_signer.otp_expires_at is null or v_signer.otp_expires_at <= now()
    or v_signer.otp_attempts >= 5 or p_session_hash !~ '^[a-f0-9]{64}$'
    then return false; end if;
  update public.sign_signers set otp_hash = null, otp_nonce = null,
    otp_expires_at = null, otp_verified_at = now(),
    session_hash = p_session_hash, session_expires_at = now() + interval '30 minutes',
    status = case when status = 'signed' then 'signed' else 'authenticated' end,
    updated_at = now() where id = p_signer_id;
  insert into public.sign_events
    (document_id, organization_id, signer_id, event_type, ip_address, user_agent)
    values (v_signer.document_id, v_signer.organization_id, p_signer_id,
      'otp.verified', p_ip_address, left(p_user_agent, 500));
  return true;
end;
$$;

revoke all on function public.sign_verify_otp(uuid, text, text, inet, text)
  from public, anon, authenticated;
grant execute on function public.sign_verify_otp(uuid, text, text, inet, text)
  to service_role;

create or replace function public.sign_reject_otp(
  p_signer_id uuid, p_otp_hash text, p_ip_address inet, p_user_agent text
) returns integer language plpgsql security invoker as $$
declare v_signer public.sign_signers%rowtype; v_attempts integer;
begin
  select * into v_signer from public.sign_signers where id = p_signer_id;
  if not found then return 0; end if;
  perform 1 from public.sign_documents where id = v_signer.document_id for update;
  select * into v_signer from public.sign_signers where id = p_signer_id for update;
  if v_signer.otp_hash is distinct from p_otp_hash or v_signer.otp_attempts >= 5 then return 0; end if;
  v_attempts := v_signer.otp_attempts + 1;
  update public.sign_signers set otp_attempts = v_attempts, updated_at = now()
    where id = p_signer_id;
  insert into public.sign_events
    (document_id, organization_id, signer_id, event_type, details, ip_address, user_agent)
    values (v_signer.document_id, v_signer.organization_id, p_signer_id,
      'otp.rejected', jsonb_build_object('attempts', v_attempts),
      p_ip_address, left(p_user_agent, 500));
  return v_attempts;
end;
$$;

revoke all on function public.sign_reject_otp(uuid, text, inet, text)
  from public, anon, authenticated;
grant execute on function public.sign_reject_otp(uuid, text, inet, text)
  to service_role;

create or replace function public.sign_claim_finalization(p_document_id uuid)
returns timestamptz language plpgsql security invoker as $$
declare v_claim timestamptz;
begin
  update public.sign_documents set finalizing_at = now()
    where id = p_document_id and status = 'partially_signed'
      and (finalizing_at is null or finalizing_at < now() - interval '10 minutes')
      and exists (select 1 from public.sign_signers where document_id = p_document_id)
      and not exists (select 1 from public.sign_signers
        where document_id = p_document_id and status <> 'signed')
    returning finalizing_at into v_claim;
  return v_claim;
end;
$$;

revoke all on function public.sign_claim_finalization(uuid) from public, anon, authenticated;
grant execute on function public.sign_claim_finalization(uuid) to service_role;

create or replace function public.sign_complete_document(
  p_document_id uuid, p_claim timestamptz, p_verification_hash text,
  p_final_path text, p_final_hash text, p_evidence_path text, p_evidence_hash text
) returns boolean language plpgsql security invoker as $$
declare v_org uuid;
begin
  if p_verification_hash !~ '^[a-f0-9]{64}$'
    or p_final_hash !~ '^[a-f0-9]{64}$'
    or p_evidence_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  update public.sign_documents set verification_code = p_verification_hash,
    final_path = p_final_path, final_sha256 = p_final_hash,
    evidence_path = p_evidence_path, evidence_sha256 = p_evidence_hash,
    status = 'completed', completed_at = now(), updated_at = now(), finalizing_at = null
    where id = p_document_id and status = 'partially_signed' and finalizing_at = p_claim
    returning organization_id into v_org;
  if v_org is null then return false; end if;
  insert into public.sign_events (document_id, organization_id, event_type, details)
    values (p_document_id, v_org, 'document.completed',
      jsonb_build_object('final_sha256', p_final_hash, 'evidence_sha256', p_evidence_hash));
  return true;
end;
$$;

revoke all on function public.sign_complete_document(uuid, timestamptz, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.sign_complete_document(uuid, timestamptz, text, text, text, text, text)
  to service_role;

create or replace function public.sign_verify_event_chain(p_document_id uuid)
returns boolean language plpgsql security invoker as $$
declare v_event public.sign_events%rowtype; v_previous text := repeat('0', 64); v_index integer := 0;
begin
  for v_event in select * from public.sign_events where document_id = p_document_id order by event_index loop
    v_index := v_index + 1;
    if v_event.event_index is distinct from v_index or v_event.previous_hash is distinct from v_previous
       or v_event.event_hash is distinct from encode(extensions.digest(
         v_event.id::text || '|' || v_event.document_id::text || '|' || v_event.organization_id::text || '|' ||
         coalesce(v_event.actor_id::text, '') || '|' || coalesce(v_event.signer_id::text, '') || '|' ||
         v_event.event_index::text || '|' || v_previous || '|' || v_event.event_type || '|' ||
         to_char(v_event.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
         v_event.details::text || '|' || coalesce(v_event.ip_address::text, '') || '|' ||
         coalesce(v_event.user_agent, ''), 'sha256'), 'hex') then return false; end if;
    v_previous := v_event.event_hash;
  end loop;
  return v_index > 0;
end;
$$;

revoke all on function public.sign_verify_event_chain(uuid) from public, anon, authenticated;
grant execute on function public.sign_verify_event_chain(uuid) to service_role;
