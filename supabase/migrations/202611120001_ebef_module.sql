begin;

create table public.ebef_members (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('Administrador','Operador'))
);

create table public.ebef_declarations (
  id uuid primary key default gen_random_uuid(),
  company text not null check (char_length(btrim(company)) between 1 and 250),
  cnpj text not null check (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
  establishment text not null check (establishment in ('Matriz','Filial')),
  year int not null check (year between 1900 and 2200),
  status text not null check (status in ('Não iniciada','Em andamento','Aguardando cliente','Em revisão','Pronta para envio','Enviada','Retificação','Retificada','Dispensado')),
  stage text not null default '' check (char_length(stage)<=150),
  owner text not null default '' check (char_length(owner)<=150),
  start date,
  due date,
  sent date,
  notes text not null default '' check (char_length(notes)<=4000),
  source_updated date,
  progress_source numeric check (progress_source between 0 and 100),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null,
  unique (cnpj,year)
);

create table public.ebef_progress_rules (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('Não iniciada','Em andamento','Aguardando cliente','Em revisão','Pronta para envio','Retificação')),
  stage text not null default '' check (char_length(stage)<=150),
  value numeric not null check (value between 0 and 100),
  unique(status,stage)
);

create table public.ebef_audit (
  id bigint generated always as identity primary key,
  declaration_id uuid not null references public.ebef_declarations(id),
  changed_at timestamptz not null,
  actor_id uuid not null,
  actor text not null,
  before jsonb,
  after jsonb not null
);
create index ebef_audit_declaration on public.ebef_audit(declaration_id, changed_at desc);

alter table public.ebef_members enable row level security;
alter table public.ebef_declarations enable row level security;
alter table public.ebef_progress_rules enable row level security;
alter table public.ebef_audit enable row level security;
revoke all on public.ebef_members, public.ebef_declarations, public.ebef_progress_rules, public.ebef_audit from anon, authenticated;
grant select on public.ebef_members, public.ebef_audit to authenticated;
grant select, insert, update on public.ebef_declarations to authenticated;
grant select, insert, update, delete on public.ebef_progress_rules to authenticated;
create policy ebef_self on public.ebef_members for select to authenticated
  using (id=(select auth.uid()) and coalesce((select auth.jwt())->'app_metadata'->>'status','') <> 'pending');
create policy ebef_read_declarations on public.ebef_declarations for select to authenticated using (exists (select 1 from public.ebef_members));
create policy ebef_insert_declarations on public.ebef_declarations for insert to authenticated with check (exists (select 1 from public.ebef_members));
create policy ebef_update_declarations on public.ebef_declarations for update to authenticated using (exists (select 1 from public.ebef_members)) with check (exists (select 1 from public.ebef_members));
create policy ebef_read_rules on public.ebef_progress_rules for select to authenticated using (exists (select 1 from public.ebef_members));
create policy ebef_admin_rules on public.ebef_progress_rules for all to authenticated using (exists (select 1 from public.ebef_members where role='Administrador')) with check (exists (select 1 from public.ebef_members where role='Administrador'));
create policy ebef_read_audit on public.ebef_audit for select to authenticated using (exists (select 1 from public.ebef_members));

create function public.ebef_stamp() returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  if tg_op='UPDATE' then new.id := old.id; end if;
  return new;
end $$;

create schema if not exists ebef_private;
create function ebef_private.log_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.ebef_audit(declaration_id, changed_at, actor_id, actor, before, after)
  values (new.id,new.updated_at,new.updated_by,coalesce(auth.jwt()->>'email',new.updated_by::text),
    case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end $$;
revoke all on function public.ebef_stamp(), ebef_private.log_change() from public, anon, authenticated;
create trigger ebef_stamp before insert or update on public.ebef_declarations for each row execute function public.ebef_stamp();
create trigger ebef_log after insert or update on public.ebef_declarations for each row execute function ebef_private.log_change();

create function public.ebef_import(items jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare
  item jsonb;
  r public.ebef_declarations;
begin
  if not exists (select 1 from public.ebef_members where role='Administrador') then
    raise exception 'A importação exige perfil Administrador.';
  end if;
  for item in select value from jsonb_array_elements(items) loop
    r := jsonb_populate_record(null::public.ebef_declarations,item->'row');
    if item->>'id' is null then
      insert into public.ebef_declarations(company,cnpj,establishment,year,status,stage,owner,start,due,sent,source_updated,progress_source)
      values (r.company,r.cnpj,r.establishment,r.year,r.status,r.stage,r.owner,r.start,r.due,r.sent,r.source_updated,r.progress_source);
    else
      update public.ebef_declarations set
        company=r.company, establishment=r.establishment,status=r.status,stage=r.stage,owner=r.owner,
        start=r.start,due=r.due,sent=r.sent,source_updated=r.source_updated,progress_source=r.progress_source
      where id=(item->>'id')::uuid and updated_at=(item->>'expected')::timestamptz and cnpj=r.cnpj and year=r.year;
      if not found then raise exception 'A carteira mudou. Reabra a prévia antes de importar.'; end if;
    end if;
  end loop;
end $$;
revoke all on function public.ebef_import(jsonb) from public, anon;
grant execute on function public.ebef_import(jsonb) to authenticated;
alter publication supabase_realtime add table public.ebef_declarations, public.ebef_progress_rules;
commit;
