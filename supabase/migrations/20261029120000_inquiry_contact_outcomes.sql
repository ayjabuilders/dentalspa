-- Factual contact outcomes only. The separate gate is intentionally closed until privacy review approves retention and visibility.
create table private.inquiry_contact_outcomes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  inquiry_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  outcome text not null check (outcome in ('attempted_no_answer','reached','requested_callback','declined','unable_to_proceed')),
  recorded_at timestamptz not null,
  event_version integer not null default 1 check (event_version=1),
  foreign key (clinic_id,inquiry_id) references public.inquiries(clinic_id,id)
);
create index inquiry_contact_outcome_recent on private.inquiry_contact_outcomes(clinic_id,inquiry_id,recorded_at desc,id desc);

create table private.inquiry_contact_outcome_idempotency (
  clinic_id uuid not null references public.clinics(id),
  actor_id uuid not null references auth.users(id),
  inquiry_id uuid not null,
  command text not null check (command='record_contact_outcome'),
  request_key uuid not null,
  normalized_payload jsonb not null,
  receipt jsonb not null,
  primary key (clinic_id,actor_id,inquiry_id,command,request_key),
  foreign key (clinic_id,inquiry_id) references public.inquiries(clinic_id,id)
);

-- Keep read and write access independently fail-closed until privacy/retention approval.
create table private.inquiry_contact_outcome_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.inquiry_contact_outcome_settings(singleton,enabled) values (true,false)
on conflict (singleton) do nothing;

-- Hold active membership authority until the RPC transaction ends, so a
-- concurrent role deactivation cannot race an authorized read or append.
create function private.lock_intake_outcome_staff(p_clinic_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception using errcode='28000',message='Authentication required';end if;
  perform 1 from public.clinic_memberships m
  where m.clinic_id=p_clinic_id and m.user_id=v_actor and m.active and m.role in ('reception','manager','dentist')
  for share;
  if not found then raise exception using errcode='42501',message='Contact outcome scope denied';end if;
  return v_actor;
end $$;
revoke all on function private.lock_intake_outcome_staff(uuid) from public,anon,authenticated;

alter table private.inquiry_contact_outcomes enable row level security;
alter table private.inquiry_contact_outcome_idempotency enable row level security;
alter table private.inquiry_contact_outcome_settings enable row level security;
revoke all on private.inquiry_contact_outcomes,private.inquiry_contact_outcome_idempotency,private.inquiry_contact_outcome_settings from public,anon,authenticated;

create function private.reject_inquiry_contact_outcome_mutation() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception using errcode='55000',message='Contact outcome history is append-only';
end $$;
revoke all on function private.reject_inquiry_contact_outcome_mutation() from public,anon,authenticated;
create trigger inquiry_contact_outcome_append_only before update or delete on private.inquiry_contact_outcomes
for each row execute function private.reject_inquiry_contact_outcome_mutation();

create function public.list_inquiry_contact_outcomes(p_clinic_id uuid,p_inquiry_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_owner uuid;v_items jsonb;v_count integer;
begin
  v_actor:=private.lock_intake_outcome_staff(p_clinic_id);
  if p_inquiry_id is null or coalesce(current_setting('request.method',true),'')<>'POST' then
    raise exception using errcode='22023',message='Invalid contact outcome request';
  end if;
  select owner_user_id into v_owner from public.inquiries where clinic_id=p_clinic_id and id=p_inquiry_id for share;
  if not found then raise exception using errcode='PT404',message='Inquiry not found';end if;
  perform private.lock_intake_outcome_staff(p_clinic_id);
  if v_owner<>v_actor then raise exception using errcode='42501',message='Contact outcome scope denied';end if;
  if not exists(select 1 from private.inquiry_contact_outcome_settings where singleton and enabled) then
    raise exception using errcode='PT503',message='Inquiry contact outcomes are disabled';
  end if;
  with recent as (
    select id,clinic_id,inquiry_id,outcome,recorded_at,event_version
    from private.inquiry_contact_outcomes
    where clinic_id=p_clinic_id and inquiry_id=p_inquiry_id
    order by recorded_at desc,id desc limit 51
  ), numbered as (
    select *,row_number() over(order by recorded_at desc,id desc) as n from recent
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'clinic_id',clinic_id,'inquiry_id',inquiry_id,'outcome',outcome,'recorded_at',recorded_at,'event_version',event_version
  ) order by recorded_at desc,id desc) filter(where n<=50),'[]'::jsonb),count(*)
  into v_items,v_count from numbered;
  return jsonb_build_object('clinic_id',p_clinic_id,'inquiry_id',p_inquiry_id,'items',v_items,'truncated',v_count>50);
end $$;

create function public.record_inquiry_contact_outcome(
  p_clinic_id uuid,p_inquiry_id uuid,p_request_key uuid,p_payload jsonb,p_correlation_id uuid
) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
  v_actor uuid;v_owner uuid;v_prior private.inquiry_contact_outcome_idempotency;
  v_item private.inquiry_contact_outcomes;v_now timestamptz;v_event jsonb;v_receipt jsonb;
begin
  v_actor:=private.lock_intake_outcome_staff(p_clinic_id);
  if p_inquiry_id is null or p_request_key is null or p_correlation_id is null
    or coalesce(current_setting('request.method',true),'')<>'POST' then
    raise exception using errcode='22023',message='Invalid contact outcome request';
  end if;
  -- Serialize retries and owner changes against one tenant-scoped inquiry row.
  select owner_user_id into v_owner from public.inquiries where clinic_id=p_clinic_id and id=p_inquiry_id for update;
  if not found then raise exception using errcode='PT404',message='Inquiry not found';end if;
  perform private.lock_intake_outcome_staff(p_clinic_id);
  if v_owner<>v_actor then raise exception using errcode='42501',message='Contact outcome scope denied';end if;
  if not exists(select 1 from private.inquiry_contact_outcome_settings where singleton and enabled) then
    raise exception using errcode='PT503',message='Inquiry contact outcomes are disabled';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object'
    or not(p_payload ?& array['outcome'])
    or (select count(*) from jsonb_object_keys(p_payload))<>1
    or jsonb_typeof(p_payload->'outcome')<>'string'
    or p_payload->>'outcome' not in ('attempted_no_answer','reached','requested_callback','declined','unable_to_proceed') then
    raise exception using errcode='22023',message='Invalid contact outcome request';
  end if;
  select * into v_prior from private.inquiry_contact_outcome_idempotency
  where clinic_id=p_clinic_id and actor_id=v_actor and inquiry_id=p_inquiry_id
    and command='record_contact_outcome' and request_key=p_request_key;
  if found then
    if v_prior.normalized_payload<>p_payload then
      raise exception using errcode='PT409',message='Contact outcome idempotency conflict';
    end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;

  v_now:=date_trunc('milliseconds',clock_timestamp());
  insert into private.inquiry_contact_outcomes(clinic_id,inquiry_id,actor_user_id,outcome,recorded_at)
  values(p_clinic_id,p_inquiry_id,v_actor,p_payload->>'outcome',v_now) returning * into v_item;

  v_event:=jsonb_build_object(
    'id',v_item.id,'clinic_id',v_item.clinic_id,'inquiry_id',v_item.inquiry_id,
    'outcome',v_item.outcome,'recorded_at',v_item.recorded_at,'event_version',v_item.event_version
  );
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
  values(p_clinic_id,v_actor,'InquiryContactOutcomeRecorded',p_inquiry_id,p_correlation_id,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
  values(p_clinic_id,'InquiryContactOutcomeRecorded',1,'inquiry',p_inquiry_id,p_correlation_id,v_actor,v_now,
    jsonb_build_object('contact_outcome_id',v_item.id,'outcome',v_item.outcome,'recorded_at',v_now));
  v_receipt:=jsonb_build_object('item',v_event,'replayed',false);
  insert into private.inquiry_contact_outcome_idempotency
  values(p_clinic_id,v_actor,p_inquiry_id,'record_contact_outcome',p_request_key,p_payload,v_receipt);
  return v_receipt;
end $$;

revoke all on function public.list_inquiry_contact_outcomes(uuid,uuid),
  public.record_inquiry_contact_outcome(uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.list_inquiry_contact_outcomes(uuid,uuid),
  public.record_inquiry_contact_outcome(uuid,uuid,uuid,jsonb,uuid) to authenticated;
