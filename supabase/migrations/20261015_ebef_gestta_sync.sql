-- LUCE E-BEF / Gestta: esquema proposto, AINDA NAO APLICADO.
-- Substitui a versao anterior, que continha SQL duplicado e truncado.
-- A migracao cria somente tabelas E-BEF isoladas: nao mexe em controle,
-- clientes, dados existentes ou em tabelas de outros modulos.
-- REQUER revisao de seguranca, backup e aprovacao antes de aplicar.
-- Executar via mecanismo de migrations; NAO executar em homologacao do RPA.

create table public.ebef_gestta_tasks (
  source_key text primary key
    check (source_key ~ '^[a-f0-9]{64}$'),
  gestta_id text unique
    check (gestta_id is null or gestta_id ~ '^[a-f0-9]{24}$'),
  cnpj text not null
    check (cnpj ~ '^[0-9]{14}$'),
  competencia text not null
    check (competencia ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  tarefa text not null,
  tipo_tarefa text not null
    check (tipo_tarefa in ('declaracao', 'verificacao')),
  tipo_registro text not null default '',
  cliente text not null,
  departamento text not null default '',
  responsavel text not null,
  status_gestta text not null,
  vencimento date,
  data_legal date,
  concluido_em date,
  feito_atrasado boolean,
  feito_com_multa boolean,
  baixado boolean,
  export_sha256 text
    check (export_sha256 is null or export_sha256 ~ '^[a-f0-9]{64}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index idx_ebef_gestta_tasks_cnpj_comp
  on public.ebef_gestta_tasks (cnpj, competencia);
create index idx_ebef_gestta_tasks_status
  on public.ebef_gestta_tasks (status_gestta);

create table public.ebef_gestta_sync_runs (
  id bigint generated always as identity primary key,
  source text not null check (source = 'gestta'),
  export_sha256 text not null
    check (export_sha256 ~ '^[a-f0-9]{64}$'),
  synced_count integer not null check (synced_count > 0),
  synced_at timestamptz not null default now()
);

-- Sem acesso anonimo ou de usuarios logados ao dado exportado do Gestta.
alter table public.ebef_gestta_tasks enable row level security;
alter table public.ebef_gestta_sync_runs enable row level security;

revoke all privileges on table public.ebef_gestta_tasks from public, anon, authenticated;
revoke all privileges on table public.ebef_gestta_sync_runs from public, anon, authenticated;
revoke all privileges on sequence public.ebef_gestta_sync_runs_id_seq
  from public, anon, authenticated;

-- A futura API server-side pode receber somente privilegios necessarios.
-- Nao conceder DELETE: conciliacao e somente insert/update.
grant select, insert, update on table public.ebef_gestta_tasks to service_role;
grant select, insert on table public.ebef_gestta_sync_runs to service_role;
grant usage, select on sequence public.ebef_gestta_sync_runs_id_seq to service_role;

-- Intencionalmente sem politicas para anon/authenticated.
-- Nao executar esta migracao ate homologar contrato da API e backup.
