-- Administrative possible match only: never verifies identity or publishes to
-- a patient account. Reuse the configured appointment command/version boundary.
create function public.associate_local_configured_appointment_patient(
  p_clinic_id uuid, p_appointment_id uuid, p_patient_id uuid,
  p_expected_version integer, p_request_key uuid, p_gate_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_row private.configured_appointments;
  v_prior private.configured_appointment_commands; v_body jsonb;
  v_receipt jsonb; v_previous uuid; v_now timestamptz;
begin
  if v_actor is null then raise exception using errcode='28000',message='unauthenticated'; end if;
  if p_clinic_id is null or p_appointment_id is null or p_expected_version is null
    or p_expected_version<1 or p_request_key is null then
    raise exception using errcode='22023',message='invalid_command';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agenda-configuration:'||p_clinic_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('scheduling:'||p_clinic_id::text,0));
  -- Recheck after waiting for scheduling locks; protect this session until commit.
  perform 1 from auth.sessions s where s.user_id=v_actor
    and s.id::text=auth.jwt()->>'session_id'
    and (s.not_after is null or s.not_after>clock_timestamp()) for share;
  if not found then raise exception using errcode='28000',message='unauthenticated'; end if;
  perform 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=v_actor
    and active and role in ('reception','manager') for share;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  perform 1 from private.agenda_configuration_gates where clinic_id=p_clinic_id and enabled
    and synthetic_only and confirmations_enabled and api_gate_key<>'' and api_gate_key=p_gate_key for share;
  if not found then raise exception using errcode='PT503',message='commands_disabled'; end if;
  v_body:=jsonb_build_object('action','associate_patient','appointment_id',p_appointment_id,
    'patient_id',p_patient_id,'expected_version',p_expected_version);
  select * into v_prior from private.configured_appointment_commands
    where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.canonical_payload<>v_body then raise exception using errcode='SH410',message='idempotency_conflict'; end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  select * into v_row from private.configured_appointments
    where clinic_id=p_clinic_id and id=p_appointment_id for update;
  if not found then raise exception using errcode='SH404',message='appointment_not_found'; end if;
  if v_row.version<>p_expected_version then raise exception using errcode='SH409',message='appointment_changed'; end if;
  if p_patient_id is not null then
    perform 1 from public.patients where clinic_id=p_clinic_id and id=p_patient_id for share;
    if not found then raise exception using errcode='SH404',message='patient_not_found'; end if;
  end if;
  if v_row.patient_id is not distinct from p_patient_id then
    raise exception using errcode='SH409',message='association_unchanged';
  end if;
  v_previous:=v_row.patient_id;
  update private.configured_appointments set patient_id=p_patient_id,version=version+1
    where clinic_id=p_clinic_id and id=p_appointment_id returning * into v_row;
  v_now:=clock_timestamp();
  v_receipt:=jsonb_build_object('appointment_id',v_row.id,'patient_id',v_row.patient_id,
    'version',v_row.version,'association_status',case when v_row.patient_id is null then 'unlinked' else 'possible_match' end,
    'identity_verified',false,'replayed',false);
  insert into private.configured_appointment_commands(clinic_id,actor_ref,request_key,appointment_id,canonical_payload,receipt)
    values(p_clinic_id,v_actor,p_request_key,p_appointment_id,v_body,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
    values(p_clinic_id,v_actor,'AppointmentPatientAssociationChanged',p_appointment_id,p_request_key,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
    values(p_clinic_id,'AppointmentPatientAssociationChanged',1,'configured_appointment',p_appointment_id,p_request_key,v_actor,v_now,
      jsonb_build_object('previous_patient_id',v_previous,'patient_id',p_patient_id,'version',v_row.version,'identity_verified',false));
  return v_receipt;
end $$;
revoke all on function public.associate_local_configured_appointment_patient(uuid,uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.associate_local_configured_appointment_patient(uuid,uuid,uuid,integer,uuid,text) to authenticated;
