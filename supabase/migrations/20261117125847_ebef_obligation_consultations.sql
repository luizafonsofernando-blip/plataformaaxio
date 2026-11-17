create table if not exists public.ebef_obligation_assessments (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  legal_name text not null check (char_length(btrim(legal_name)) between 1 and 250),
  legal_nature text not null check (char_length(btrim(legal_nature)) between 1 and 180),
  establishment text not null check (establishment in ('Matriz', 'Filial', 'matrix', 'branch')),
  calendar_year integer not null check (calendar_year between 2026 and 2035),
  reference_date date not null,
  assessed_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  input_json jsonb not null check (jsonb_typeof(input_json) = 'object' and octet_length(input_json::text) <= 65536),
  result_json jsonb not null check (jsonb_typeof(result_json) = 'object' and octet_length(result_json::text) <= 65536),
  rules_version text not null check (char_length(btrim(rules_version)) between 1 and 100),
  linked_declaration_id uuid references public.ebef_declarations(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists ebef_obligation_assessments_cnpj_created_idx
  on public.ebef_obligation_assessments (cnpj, created_at desc);
create index if not exists ebef_obligation_assessments_year_result_idx
  on public.ebef_obligation_assessments (calendar_year, (result_json->>'status'));

alter table public.ebef_obligation_assessments enable row level security;

revoke all on table public.ebef_obligation_assessments from anon, public, authenticated;
grant select, insert on table public.ebef_obligation_assessments to authenticated;

create policy ebef_read_obligation_assessments
  on public.ebef_obligation_assessments
  for select
  to authenticated
  using (
    (select ebef_private.access_level()) = any (array['Administrador'::text, 'Operador'::text])
    or (
      (select ebef_private.access_level()) = 'Operador · carteira própria'::text
      and assessed_by = (select auth.uid())
    )
  );

create policy ebef_insert_obligation_assessments
  on public.ebef_obligation_assessments
  for insert
  to authenticated
  with check (
    (select ebef_private.access_level()) is not null
    and assessed_by = (select auth.uid())
    and (
      linked_declaration_id is null
      or exists (
        select 1
        from public.ebef_declarations d
        where d.id = linked_declaration_id
          and d.cnpj = ebef_obligation_assessments.cnpj
      )
    )
  );
