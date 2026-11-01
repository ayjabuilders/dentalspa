-- Manager-only administrative reassignment; no clinical, booking, or contact effect.
create table private.inquiry_owner_reassignment_idempotency (
  clinic_id uuid not null references public.clinics(id),
  actor_id uuid not null references auth.users(id),
  request_key uuid not null,
  inquiry_id uuid not null,
  normalized_payload jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null,
  primary key(clinic_id,actor_id,request_key),
  foreign key(clinic_id,inquiry_id) references public.inquiries(clinic_id,id)
);
alter table private.inquiry_owner_reassignment_idempotency enable row level security;
revoke all on private.inquiry_owner_reassignment_idempotency from public,anon,authenticated,service_role;

create function public.reassign_inquiry_owner(
  p_clinic_id uuid,
  p_inquiry_id uuid,
  p_expected_owner_user_id uuid,
  p_owner_user_id uuid,
  p_request_key uuid,
  p_correlation_id uuid
) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
  v_actor uuid:=auth.uid();
  v_current_owner uuid;
  v_payload jsonb;
  v_now timestamptz;
  v_previous private.inquiry_owner_reassignment_idempotency%rowtype;
  v_receipt jsonb;
  v_result jsonb;
  v_changed boolean;
begin
  if v_actor is null then raise exception using errcode='28000',message='Authentication required';end if;
  if p_clinic_id is null or p_inquiry_id is null or p_expected_owner_user_id is null or p_owner_user_id is null
     or p_request_key is null or p_correlation_id is null
     or coalesce(current_setting('request.method',true),'')<>'POST' then
    raise exception using errcode='22023',message='Invalid owner reassignment';
  end if;
  if not exists(select 1 from public.clinic_memberships m where m.clinic_id=p_clinic_id and m.user_id=v_actor and m.active and m.role='manager') then
    raise exception using errcode='42501',message='Owner reassignment scope denied';
  end if;
  if not exists(select 1 from private.intake_command_settings s where s.singleton and s.enabled) then
    raise exception using errcode='PT503',message='Intake commands are disabled';
  end if;

  -- Serialize all owner changes for this inquiry, including concurrent manager actions.
  select i.owner_user_id into v_current_owner from public.inquiries i
  where i.clinic_id=p_clinic_id and i.id=p_inquiry_id for update;
  if not found then raise exception using errcode='PT404',message='Inquiry not found';end if;
  if not exists(select 1 from public.clinic_memberships m where m.clinic_id=p_clinic_id and m.user_id=v_actor and m.active and m.role='manager') then
    raise exception using errcode='42501',message='Owner reassignment scope denied';
  end if;
  if not exists(select 1 from private.intake_command_settings s where s.singleton and s.enabled) then
    raise exception using errcode='PT503',message='Intake commands are disabled';
  end if;

  v_payload:=jsonb_build_object('expected_owner_user_id',p_expected_owner_user_id,'owner_user_id',p_owner_user_id);
  insert into private.inquiry_owner_reassignment_idempotency(clinic_id,actor_id,request_key,inquiry_id,normalized_payload,receipt,created_at)
  values(p_clinic_id,v_actor,p_request_key,p_inquiry_id,v_payload,'{}'::jsonb,date_trunc('milliseconds',clock_timestamp()))
  on conflict(clinic_id,actor_id,request_key) do nothing;
  select r.* into strict v_previous from private.inquiry_owner_reassignment_idempotency r
  where r.clinic_id=p_clinic_id and r.actor_id=v_actor and r.request_key=p_request_key for update;
  if v_previous.normalized_payload<>v_payload or v_previous.inquiry_id<>p_inquiry_id then
    raise exception using errcode='PT409',message='Owner reassignment idempotency conflict';
  end if;
  if v_previous.receipt<>'{}'::jsonb then
    return jsonb_set(v_previous.receipt,'{replayed}','true'::jsonb,false);
  end if;

  if v_current_owner<>p_expected_owner_user_id then
    raise exception using errcode='PT409',message='Inquiry owner changed';
  end if;
  v_changed:=p_owner_user_id<>v_current_owner;
  if v_changed and not exists(
    select 1 from public.clinic_memberships m
    where m.clinic_id=p_clinic_id and m.user_id=p_owner_user_id and m.active and m.role in ('reception','manager','dentist')
  ) then raise exception using errcode='42501',message='Target is not an active intake owner';end if;

  v_now:=date_trunc('milliseconds',clock_timestamp());
  if v_changed then
    update public.inquiries set owner_user_id=p_owner_user_id where clinic_id=p_clinic_id and id=p_inquiry_id;
    insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
    values(p_clinic_id,v_actor,'InquiryOwnerReassigned',p_inquiry_id,p_correlation_id,v_now);
    insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
    values(p_clinic_id,'InquiryOwnerReassigned',1,'inquiry',p_inquiry_id,p_correlation_id,v_actor,v_now,
      jsonb_build_object('inquiry_id',p_inquiry_id,'previous_owner_user_id',v_current_owner,'owner_user_id',p_owner_user_id));
  end if;

  v_receipt:=jsonb_build_object('inquiry_id',p_inquiry_id,'clinic_id',p_clinic_id,
    'previous_owner_user_id',v_current_owner,'owner_user_id',p_owner_user_id,
    'changed',v_changed,'recorded_at',v_now,'event_version',1);
  v_result:=jsonb_build_object('receipt',v_receipt,'replayed',false);
  update private.inquiry_owner_reassignment_idempotency set receipt=v_result
  where clinic_id=p_clinic_id and actor_id=v_actor and request_key=p_request_key;
  return v_result;
end $$;
revoke all on function public.reassign_inquiry_owner(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reassign_inquiry_owner(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated;