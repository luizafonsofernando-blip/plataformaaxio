-- Gate Cerne integration for Briefing Abertura until the onboarding document is completed.

create or replace function public.enqueue_cerne_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  briefing_type text;
  event_kind text;
  opening_completed boolean;
begin
  if new.status <> 'final' or new.kind <> 'briefing' then
    return new;
  end if;

  briefing_type := upper(coalesce(
    new.form_state #>> '{fields,tipoBriefing}',
    new.form_state #>> '{fields,tipoBriefingSecao}',
    new.procedimento,
    new.title,
    ''
  ));

  opening_completed := coalesce((new.form_state #>> '{meta,openingBriefingCompleted}')::boolean, false);

  if briefing_type like '%BRIEFING ABERTURA%' and not opening_completed then
    delete from public.cerne_onboarding_queue
    where source_document_id = new.id
      and event_type = 'entry'
      and status = 'pending';
    return new;
  end if;

  event_kind := case
    when briefing_type like '%BAIXA%' or briefing_type like '%SAIDA%' or briefing_type like '%SAÍDA%' then 'exit'
    else 'entry'
  end;

  insert into public.cerne_onboarding_queue
    (source_document_id, owner_id, event_type, payload)
  values
    (new.id, new.owner_id, event_kind,
      jsonb_build_object(
        'empresa', new.empresa,
        'documento', new.documento,
        'procedimento', new.procedimento,
        'serial', new.serial,
        'form_state', new.form_state
      )
    )
  on conflict (source_document_id, event_type) do update
    set payload = excluded.payload,
        owner_id = excluded.owner_id;

  return new;
end;
$$;

revoke all on function public.enqueue_cerne_onboarding() from public, anon, authenticated;
