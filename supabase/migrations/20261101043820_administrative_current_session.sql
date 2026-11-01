-- Session revocation enforcement; existing role, tenant, activation and command rules retained.
CREATE OR REPLACE FUNCTION public.confirm_demo_booking_request(p_clinic_id uuid, p_booking_request_id uuid, p_provider_resource_id uuid, p_chair_resource_id uuid, p_request_key uuid, p_gate_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
  v_actor uuid;
  v_request private.demo_booking_requests;
  v_prior private.demo_booking_confirmation_idempotency;
  v_appointment private.demo_confirmed_appointments;
  v_payload jsonb;
  v_receipt jsonb;
  v_now timestamptz;
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception using errcode = '28000', message = 'unauthenticated'; end if;
  perform private.require_current_session();
  if p_clinic_id <> '10000000-0000-4000-8000-000000000001'::uuid
     or p_booking_request_id is null or p_provider_resource_id is null
     or p_chair_resource_id is null or p_request_key is null then
    raise exception using errcode = '22023', message = 'invalid_request';
  end if;
  perform 1 from public.clinic_memberships m
   where m.clinic_id = p_clinic_id and m.user_id = v_actor and m.active
     and m.role in ('reception', 'manager') for key share;
  if not found then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if not exists (select 1 from private.demo_booking_confirmation_settings s
    where s.singleton and s.enabled and s.api_gate_key <> '' and s.api_gate_key = p_gate_key) then
    raise exception using errcode = 'PT503', message = 'demo_confirmation_disabled';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('demo-booking-confirmation:' || p_clinic_id::text, 0));
  v_payload := jsonb_build_object('booking_request_id', p_booking_request_id,
    'provider_resource_id', p_provider_resource_id, 'chair_resource_id', p_chair_resource_id);
  select * into v_prior from private.demo_booking_confirmation_idempotency i
   where i.clinic_id = p_clinic_id and i.actor_ref = v_actor and i.request_key = p_request_key;
  if found then
    if v_prior.canonical_payload <> v_payload then
      raise exception using errcode = 'SH410', message = 'idempotency_conflict';
    end if;
    return v_prior.receipt || jsonb_build_object('replayed', true);
  end if;

  select * into v_request from private.demo_booking_requests r
   where r.clinic_id = p_clinic_id and r.id = p_booking_request_id for update;
  if not found then raise exception using errcode = 'SH404', message = 'resource_not_found'; end if;
  if exists (select 1 from private.demo_confirmed_appointments a
    where a.clinic_id = p_clinic_id and a.booking_request_id = p_booking_request_id) then
    raise exception using errcode = 'SH412', message = 'request_already_confirmed';
  end if;

  perform 1 from private.demo_booking_sample_resources r
   where r.clinic_id = p_clinic_id and r.id = p_provider_resource_id
     and r.kind = 'provider' and r.active;
  if not found then raise exception using errcode = '22023', message = 'invalid_request'; end if;
  perform 1 from private.demo_booking_sample_resources r
   where r.clinic_id = p_clinic_id and r.id = p_chair_resource_id
     and r.kind = 'chair' and r.active;
  if not found then raise exception using errcode = '22023', message = 'invalid_request'; end if;

  v_local_start := v_request.requested_date + v_request.requested_time;
  v_local_end := v_local_start + interval '45 minutes';
  v_now := date_trunc('milliseconds', clock_timestamp());
  if v_local_start < (v_now at time zone 'Africa/Casablanca')
     or v_local_start::date > (v_now at time zone 'Africa/Casablanca')::date + 90
     or extract(isodow from v_local_start) > 6
     or not ((v_local_start::time >= time '09:00' and v_local_end::time <= time '12:00')
       or (v_local_start::time >= time '14:00' and v_local_end::time <= time '18:00')) then
    raise exception using errcode = '22023', message = 'outside_sample_booking_rules';
  end if;

  insert into private.demo_confirmed_appointments(
    clinic_id, booking_request_id, scenario_id, provider_resource_id, chair_resource_id,
    starts_at, ends_at, confirmed_by, confirmed_at
  ) values (
    p_clinic_id, p_booking_request_id, v_request.scenario_id, p_provider_resource_id, p_chair_resource_id,
    v_local_start at time zone 'Africa/Casablanca', v_local_end at time zone 'Africa/Casablanca', v_actor, v_now
  ) returning * into v_appointment;

  select jsonb_build_object('id', r.id, 'display_name', r.display_name) into v_receipt
   from private.demo_booking_sample_resources r where r.id = p_provider_resource_id;
  v_receipt := jsonb_build_object(
    'status', 'confirmed', 'appointment_id', v_appointment.id,
    'booking_request_id', v_appointment.booking_request_id,
    'scenario_id', v_appointment.scenario_id,
    'starts_at', v_appointment.starts_at, 'ends_at', v_appointment.ends_at,
    'duration_minutes', v_appointment.duration_minutes,
    'provider_resource_id', v_appointment.provider_resource_id,
    'chair_resource_id', v_appointment.chair_resource_id,
    'confirmed_at', v_appointment.confirmed_at
  );
  insert into private.audit_events(clinic_id, actor_ref, action, aggregate_id, correlation_id, occurred_at)
  values (p_clinic_id, v_actor, 'DemoAppointmentConfirmed', v_appointment.id, p_request_key, v_now);
  insert into private.outbox_events(
    clinic_id, event_type, event_version, aggregate_type, aggregate_id, correlation_id,
    actor_ref, occurred_at, payload
  ) values (
    p_clinic_id, 'DemoAppointmentConfirmed', 1, 'demo_confirmed_appointment', v_appointment.id,
    p_request_key, v_actor, v_now,
    jsonb_build_object('scenario_id', v_appointment.scenario_id,
      'booking_request_id', v_appointment.booking_request_id, 'status', v_appointment.status)
  );
  insert into private.demo_booking_confirmation_idempotency(
    clinic_id, actor_ref, request_key, booking_request_id, canonical_payload, receipt, created_at
  ) values (p_clinic_id, v_actor, p_request_key, p_booking_request_id, v_payload, v_receipt, v_now);
  return v_receipt || jsonb_build_object('replayed', false);
exception
  when exclusion_violation then raise exception using errcode = 'SH409', message = 'resource_conflict';
end
$function$;

CREATE OR REPLACE FUNCTION public.list_patient_admin_document_checklist(p_clinic_id uuid, p_patient_id uuid, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_items jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  perform private.require_current_session();
  if p_clinic_id is null or p_patient_id is null or p_correlation_id is null
    or coalesce(current_setting('request.method', true), '') <> 'POST' then
    raise exception using errcode = '22023', message = 'Invalid checklist request';
  end if;

  perform 1 from public.clinic_memberships m
  where m.clinic_id = p_clinic_id and m.user_id = v_actor and m.active
    and m.role in ('reception', 'manager', 'dentist')
  for share;
  if not found then raise exception using errcode = '42501', message = 'Checklist unavailable'; end if;
  perform 1 from public.patients p where p.clinic_id = p_clinic_id and p.id = p_patient_id;
  if not found then raise exception using errcode = 'PT404', message = 'Checklist unavailable'; end if;
  if not exists (select 1 from private.patient_admin_document_checklist_settings s where s.singleton and s.enabled) then
    raise exception using errcode = 'PT503', message = 'Checklist disabled';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'clinic_id', c.clinic_id,
    'patient_id', c.patient_id,
    'kind', c.kind,
    'status', c.status,
    'revision', c.revision,
    'updated_at', to_char(c.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updated_by', c.updated_by
  ) order by c.kind), '[]'::jsonb)
  into v_items
  from private.patient_admin_document_checklist c
  where c.clinic_id = p_clinic_id and c.patient_id = p_patient_id and c.revision > 0;

  insert into private.audit_events(clinic_id, actor_ref, action, aggregate_id, correlation_id, occurred_at)
  values (p_clinic_id, v_actor, 'PatientAdminDocumentChecklistViewed', p_patient_id, p_correlation_id, v_now);
  insert into private.outbox_events(clinic_id, event_type, event_version, aggregate_type, aggregate_id, correlation_id, actor_ref, occurred_at, payload)
  values (p_clinic_id, 'PatientAdminDocumentChecklistViewed', 1, 'patient', p_patient_id, p_correlation_id, v_actor, v_now,
    jsonb_build_object('access_scope', 'clinic_admin_document_checklist'));

  return jsonb_build_object('schema_version', 1, 'clinic_id', p_clinic_id, 'patient_id', p_patient_id, 'items', v_items);
end $function$;

CREATE OR REPLACE FUNCTION public.reassign_inquiry_owner(p_clinic_id uuid, p_inquiry_id uuid, p_expected_owner_user_id uuid, p_owner_user_id uuid, p_request_key uuid, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
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
  perform private.require_current_session();
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
end $function$;

CREATE OR REPLACE FUNCTION public.set_patient_admin_document_checklist(p_clinic_id uuid, p_patient_id uuid, p_payload jsonb, p_request_key uuid, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_expected numeric;
  v_kind text;
  v_status text;
  v_normalized jsonb;
  v_prior private.patient_admin_document_checklist_receipts;
  v_state private.patient_admin_document_checklist;
  v_item jsonb;
  v_now timestamptz;
  v_changed boolean;
begin
  if v_actor is null then raise exception using errcode = '28000', message = 'Authentication required'; end if;
  perform private.require_current_session();
  if p_clinic_id is null or p_patient_id is null or p_request_key is null or p_correlation_id is null
    or coalesce(current_setting('request.method', true), '') <> 'POST' then
    raise exception using errcode = '22023', message = 'Invalid checklist request';
  end if;

  perform 1 from public.clinic_memberships m
  where m.clinic_id = p_clinic_id and m.user_id = v_actor and m.active
    and m.role in ('reception', 'manager', 'dentist')
  for share;
  if not found then raise exception using errcode = '42501', message = 'Checklist unavailable'; end if;
  perform 1 from public.patients p where p.clinic_id = p_clinic_id and p.id = p_patient_id;
  if not found then raise exception using errcode = 'PT404', message = 'Checklist unavailable'; end if;
  if not exists (select 1 from private.patient_admin_document_checklist_settings s where s.singleton and s.enabled) then
    raise exception using errcode = 'PT503', message = 'Checklist disabled';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or not (p_payload ?& array['expected_revision', 'kind', 'status'])
    or (select count(*) from jsonb_object_keys(p_payload)) <> 3
    or jsonb_typeof(p_payload->'expected_revision') <> 'number'
    or jsonb_typeof(p_payload->'kind') <> 'string'
    or jsonb_typeof(p_payload->'status') <> 'string' then
    raise exception using errcode = '22023', message = 'Invalid checklist request';
  end if;
  v_expected := (p_payload->>'expected_revision')::numeric;
  v_kind := p_payload->>'kind';
  v_status := p_payload->>'status';
  if v_expected < 0 or v_expected > 2147483646 or v_expected <> trunc(v_expected)
    or v_kind not in ('cnss', 'cnops')
    or v_status not in ('not_applicable', 'missing', 'received', 'needs_correction', 'completed_manually') then
    raise exception using errcode = '22023', message = 'Invalid checklist request';
  end if;
  v_normalized := jsonb_build_object('expected_revision', v_expected::integer, 'kind', v_kind, 'status', v_status);

  insert into private.patient_admin_document_checklist(clinic_id, patient_id, kind, status, revision)
  values (p_clinic_id, p_patient_id, v_kind, null, 0)
  on conflict (clinic_id, patient_id, kind) do nothing;
  select * into v_state from private.patient_admin_document_checklist c
  where c.clinic_id = p_clinic_id and c.patient_id = p_patient_id and c.kind = v_kind
  for update;

  select * into v_prior from private.patient_admin_document_checklist_receipts r
  where r.clinic_id = p_clinic_id and r.actor_id = v_actor and r.request_key = p_request_key;
  if found then
    if v_prior.patient_id <> p_patient_id or v_prior.normalized_payload <> v_normalized then
      raise exception using errcode = 'PT409', message = 'Checklist command conflict';
    end if;
    return jsonb_build_object('item', v_prior.item, 'replayed', true);
  end if;
  if v_state.revision <> v_expected then raise exception using errcode = 'PT409', message = 'Checklist changed'; end if;

  v_changed := v_state.status is distinct from v_status;
  v_now := clock_timestamp();
  if v_changed then
    update private.patient_admin_document_checklist
    set status = v_status, revision = v_state.revision + 1, updated_at = v_now, updated_by = v_actor
    where clinic_id = p_clinic_id and patient_id = p_patient_id and kind = v_kind
    returning * into v_state;
  end if;
  v_item := jsonb_build_object(
    'clinic_id', p_clinic_id,
    'patient_id', p_patient_id,
    'kind', v_state.kind,
    'status', v_state.status,
    'revision', v_state.revision,
    'updated_at', to_char(v_state.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updated_by', v_state.updated_by
  );
  insert into private.patient_admin_document_checklist_receipts(clinic_id, patient_id, actor_id, request_key, normalized_payload, item, created_at)
  values (p_clinic_id, p_patient_id, v_actor, p_request_key, v_normalized, v_item, v_now);

  if v_changed then
    insert into private.audit_events(clinic_id, actor_ref, action, aggregate_id, correlation_id, occurred_at)
    values (p_clinic_id, v_actor, 'PatientAdminDocumentChecklistChanged', p_patient_id, p_correlation_id, v_now);
    insert into private.outbox_events(clinic_id, event_type, event_version, aggregate_type, aggregate_id, correlation_id, actor_ref, occurred_at, payload)
    values (p_clinic_id, 'PatientAdminDocumentChecklistChanged', 1, 'patient', p_patient_id, p_correlation_id, v_actor, v_now,
      jsonb_build_object('kind', v_kind, 'status', v_status, 'revision', v_state.revision));
  end if;
  return jsonb_build_object('item', v_item, 'replayed', false);
end $function$;
