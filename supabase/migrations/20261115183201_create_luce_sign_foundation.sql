create table if not exists public.sign_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 160),
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sign_organizations_cnpj_key
  on public.sign_organizations (cnpj) where cnpj is not null;

create table if not exists public.sign_members (
  organization_id uuid not null references public.sign_organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('admin', 'manager', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists sign_members_user_idx on public.sign_members (user_id);

create or replace function public.sign_add_organization_owner()
returns trigger language plpgsql as $$
begin
  insert into public.sign_members (organization_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

drop trigger if exists sign_organization_owner on public.sign_organizations;
create trigger sign_organization_owner
  after insert on public.sign_organizations
  for each row execute function public.sign_add_organization_owner();

create table if not exists public.sign_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sign_organizations(id) on delete restrict,
  title text not null check (length(btrim(title)) between 2 and 200),
  category text not null default 'Outros' check (length(btrim(category)) between 2 and 100),
  status text not null default 'draft' check (status in ('draft', 'prepared', 'sent', 'viewed', 'partially_signed', 'completed', 'declined', 'expired', 'cancelled', 'error')),
  original_path text,
  original_sha256 text check (original_sha256 is null or original_sha256 ~ '^[a-f0-9]{64}$'),
  original_size integer check (original_size is null or original_size between 1 and 10485760),
  page_count integer check (page_count is null or page_count between 1 and 500),
  expires_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sign_original_complete check (
    (original_path is null and original_sha256 is null and original_size is null)
    or (original_path is not null and original_sha256 is not null and original_size is not null)
  ),
  unique (id, organization_id)
);

create index if not exists sign_documents_org_created_idx
  on public.sign_documents (organization_id, created_at desc);
create index if not exists sign_documents_org_status_idx
  on public.sign_documents (organization_id, status, updated_at desc);

create or replace function public.sign_protect_original_pdf()
returns trigger language plpgsql as $$
begin
  if old.original_path is not null and
     (old.original_path, old.original_sha256, old.original_size, old.page_count)
       is distinct from
     (new.original_path, new.original_sha256, new.original_size, new.page_count) then
    raise exception 'Original PDF is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists sign_original_immutable on public.sign_documents;
create trigger sign_original_immutable
  before update on public.sign_documents
  for each row execute function public.sign_protect_original_pdf();

create table if not exists public.sign_signers (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  organization_id uuid not null references public.sign_organizations(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) between 2 and 160),
  email text not null check (length(email) <= 254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role text not null default 'Outro' check (length(btrim(role)) between 2 and 80),
  signing_order integer not null default 1 check (signing_order between 1 and 100),
  status text not null default 'pending' check (status in ('pending', 'invited', 'viewed', 'authenticated', 'signed', 'declined', 'expired')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, email),
  foreign key (document_id, organization_id) references public.sign_documents(id, organization_id) on delete restrict
);

create index if not exists sign_signers_document_idx on public.sign_signers (document_id, signing_order);

create table if not exists public.sign_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  organization_id uuid not null references public.sign_organizations(id) on delete restrict,
  actor_id uuid references auth.users(id),
  event_type text not null check (length(btrim(event_type)) between 3 and 80),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (document_id, organization_id) references public.sign_documents(id, organization_id) on delete restrict
);

create index if not exists sign_events_document_time_idx on public.sign_events (document_id, created_at);

create or replace function public.sign_record_document_event()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.sign_events (document_id, organization_id, actor_id, event_type)
    values (new.id, new.organization_id, new.created_by, 'document.created');
  elsif old.original_path is null and new.original_path is not null then
    insert into public.sign_events (document_id, organization_id, actor_id, event_type, details)
    values (new.id, new.organization_id, new.updated_by, 'document.uploaded',
      jsonb_build_object('sha256', new.original_sha256, 'size', new.original_size));
  end if;
  return new;
end;
$$;

drop trigger if exists sign_document_event on public.sign_documents;
create trigger sign_document_event
  after insert or update of original_path on public.sign_documents
  for each row execute function public.sign_record_document_event();

create or replace function public.sign_record_signer_event()
returns trigger language plpgsql as $$
begin
  insert into public.sign_events (document_id, organization_id, actor_id, event_type, details)
  values (new.document_id, new.organization_id, new.created_by, 'signer.added',
    jsonb_build_object('signer_id', new.id));
  return new;
end;
$$;

drop trigger if exists sign_signer_event on public.sign_signers;
create trigger sign_signer_event
  after insert on public.sign_signers
  for each row execute function public.sign_record_signer_event();

create or replace function public.sign_reject_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Signature events are append-only';
end;
$$;

drop trigger if exists sign_events_append_only on public.sign_events;
create trigger sign_events_append_only
  before update or delete on public.sign_events
  for each row execute function public.sign_reject_event_mutation();

alter table public.sign_organizations enable row level security;
alter table public.sign_members enable row level security;
alter table public.sign_documents enable row level security;
alter table public.sign_signers enable row level security;
alter table public.sign_events enable row level security;

revoke all on public.sign_organizations, public.sign_members, public.sign_documents, public.sign_signers, public.sign_events from anon, authenticated;
grant select, insert, update, delete on public.sign_organizations, public.sign_members, public.sign_documents, public.sign_signers to service_role;
grant select, insert on public.sign_events to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('luce-sign-private', 'luce-sign-private', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
