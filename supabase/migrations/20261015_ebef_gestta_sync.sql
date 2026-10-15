-- LUCE E-BEF Sync: somente novas tabelas. NÃO altera registros de controle existentes.
-- Aplicar manualmente no SQL Editor depois de revisar permissões e backup.

create table if not exists public.ebef_gestta_tasks (
  source_key text primary key check (source_key ~ '^[a-f0-9]{64}$'),
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  competencia text not null check (competencia ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  tarefa text not null,
  cliente text not null,
  departamento text not null default '',
  responsavel text not null,
  status_gestta text not null,
  export_sha256 text check (export_sha256 is null or export_sha256 ~ '^[a-f0-9]{64}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_ebef_gestta_tasks_cnpj_comp
  on public.ebef_gestta_tasks (cnpj, competencia);
create index if not exists idx_ebef_gestta_tasks_status
  on public.ebef_gestta_tasks (status_gestta);

create table if not exists public.ebef_gestta_sync_runs (
  id bigint generated always as identity primary key,
  source text not null check (source = 'gestta'),
  export_sha256 text not null check (export_sha256 ~ '^[a-f0-9]{64}$'),
  synced_count integer not null check (synced_count > 0),
  synced_at timestamptz not null default now()
);

-- Sem leitura ou escrita por anon/authenticated. A sincronização usa a chave
-- service_role somente em ambiente server-side da Vercel, nunca no navegador.
alter table public.ebef_gestta_tasks enable row level security;
alter table public.ebef_gestta_sync_runs enable row level security;
revoke all on table public.ebef_gestta_tasks from anon, authenticated;
revoke all on table public.ebef_gestta_sync_runs from anon, authenticated;
revoke all on sequence public.ebef_gestta_sync_runs_id_seq from anon, authenticated;
