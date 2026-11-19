-- Beta drafts are separate from immutable, engine-produced rtc_analyses.
create table public.rtc_simulation_drafts (
  id uuid primary key,
  organization_id uuid not null references public.rtc_organizations(id) on delete restrict,
  company_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  engine text not null check (engine in ('regular', 'simples')),
  operation_date date not null,
  scenario jsonb not null check (jsonb_typeof(scenario) = 'object' and octet_length(scenario::text) <= 32768),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, organization_id)
    references public.rtc_companies(id, organization_id) on delete restrict
);
create index rtc_simulation_drafts_company_time_idx
  on public.rtc_simulation_drafts(company_id, updated_at desc);

create function public.rtc_audit_simulation_draft()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.company_id <> old.company_id
      or new.created_by <> old.created_by or new.created_at <> old.created_at
      or new.version <> old.version + 1 then
      raise exception 'RTC draft identity/version cannot be changed';
    end if;
    new.updated_at := now();
  end if;
  insert into public.rtc_audit_events(organization_id, actor_id, event_type, details)
  values(new.organization_id, new.created_by,
    case when tg_op = 'INSERT' then 'simulation_draft_created' else 'simulation_draft_updated' end,
    jsonb_build_object('draft_id', new.id, 'company_id', new.company_id, 'version', new.version));
  return new;
end;
$$;
revoke all on function public.rtc_audit_simulation_draft() from public, anon, authenticated;
create trigger rtc_simulation_drafts_audit
  before insert or update on public.rtc_simulation_drafts
  for each row execute function public.rtc_audit_simulation_draft();

alter table public.rtc_simulation_drafts enable row level security;
revoke all on public.rtc_simulation_drafts from anon, authenticated;
grant select on public.rtc_simulation_drafts to authenticated;
grant select, insert, update on public.rtc_simulation_drafts to service_role;
create policy rtc_simulation_drafts_allowed_select on public.rtc_simulation_drafts
  for select to authenticated using (exists (
    select 1 from public.rtc_companies c
    where c.id = rtc_simulation_drafts.company_id
      and c.organization_id = rtc_simulation_drafts.organization_id
  ));
