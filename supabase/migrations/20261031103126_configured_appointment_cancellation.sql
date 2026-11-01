alter table private.configured_appointments add column cancelled_at timestamptz;
alter table private.configured_appointments add constraint configured_cancellation_consistent check((status='cancelled')=(cancelled_at is not null));
create table private.configured_appointment_commands (
  clinic_id uuid not null,actor_ref uuid not null,request_key uuid not null,
  appointment_id uuid not null,canonical_payload jsonb not null,receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,actor_ref,request_key),
  foreign key(clinic_id,appointment_id) references private.configured_appointments(clinic_id,id)
);
alter table private.configured_appointment_commands enable row level security;
revoke all on private.configured_appointment_commands from public,anon,authenticated;
create function public.cancel_local_configured_appointment(p_clinic_id uuid,p_appointment_id uuid,p_expected_version integer,p_request_key uuid,p_gate_key text)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_row private.configured_appointments;v_prior private.configured_appointment_commands;
  v_body jsonb;v_receipt jsonb;v_now timestamptz;
begin
  if v_actor is null then raise exception using errcode='28000',message='unauthenticated';end if;
  perform pg_advisory_xact_lock(hashtextextended('agenda-configuration:'||p_clinic_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('scheduling:'||p_clinic_id::text,0));
  perform 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=v_actor and active and role in ('reception','manager') for share;
  if not found then raise exception using errcode='42501',message='forbidden';end if;
  perform 1 from private.agenda_configuration_gates where clinic_id=p_clinic_id and enabled and synthetic_only
    and confirmations_enabled and api_gate_key<>'' and api_gate_key=p_gate_key for share;
  if not found then raise exception using errcode='PT503',message='local_commands_disabled';end if;
  if p_appointment_id is null or p_request_key is null or p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='invalid_command';end if;
  v_body:=jsonb_build_object('appointment_id',p_appointment_id,'action','cancel','expected_version',p_expected_version);
  select * into v_prior from private.configured_appointment_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.canonical_payload<>v_body then raise exception using errcode='SH410',message='idempotency_conflict';end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  select * into v_row from private.configured_appointments where clinic_id=p_clinic_id and id=p_appointment_id for update;
  if not found then raise exception using errcode='SH404',message='appointment_not_found';end if;
  if v_row.status<>'confirmed' or v_row.version<>p_expected_version then raise exception using errcode='SH409',message='appointment_changed';end if;
  v_now:=clock_timestamp();
  update private.configured_appointments set status='cancelled',cancelled_at=v_now,version=version+1
    where clinic_id=p_clinic_id and id=p_appointment_id returning * into v_row;
  update private.scheduling_occupancy set active=false where clinic_id=p_clinic_id and appointment_id=p_appointment_id;
  v_receipt:=jsonb_build_object('appointment_id',p_appointment_id,'status','cancelled','version',v_row.version,
    'starts_at',private.scheduling_time(v_row.starts_at),'ends_at',private.scheduling_time(v_row.ends_at),'replayed',false);
  insert into private.configured_appointment_commands(clinic_id,actor_ref,request_key,appointment_id,canonical_payload,receipt)
    values(p_clinic_id,v_actor,p_request_key,p_appointment_id,v_body,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
    values(p_clinic_id,v_actor,'ConfiguredAppointmentCancelled',p_appointment_id,p_request_key,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
    values(p_clinic_id,'ConfiguredAppointmentCancelled',1,'configured_appointment',p_appointment_id,p_request_key,v_actor,v_now,
      jsonb_build_object('status','cancelled','version',v_row.version));
  return v_receipt;
end $$;
revoke all on function public.cancel_local_configured_appointment(uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_local_configured_appointment(uuid,uuid,integer,uuid,text) to authenticated;
