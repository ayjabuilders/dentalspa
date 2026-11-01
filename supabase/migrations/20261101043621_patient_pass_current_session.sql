-- Require a live account session before accessing the verified patient association.
-- CREATE OR REPLACE preserves the existing restrictive function grants.
CREATE OR REPLACE FUNCTION public.get_my_patient_communication_preferences(p_clinic_id uuid, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_patient_id uuid;
  v_state private.patient_communication_preferences;
  v_now timestamptz:=clock_timestamp();
begin
  if v_actor is null then raise exception using errcode='28000',message='Authentication required';end if;
  perform private.require_current_session();
  if p_clinic_id is null or p_correlation_id is null or coalesce(current_setting('request.method',true),'')<>'POST' then
    raise exception using errcode='22023',message='Invalid patient preferences request';
  end if;
  select l.patient_id into v_patient_id from public.patient_account_links l
  where l.user_id=v_actor and l.clinic_id=p_clinic_id and l.verified_at is not null for share;
  if not found then raise exception using errcode='42501',message='Patient preferences unavailable';end if;
  select * into v_state from private.patient_communication_preferences s where s.clinic_id=p_clinic_id and s.patient_id=v_patient_id;
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
  values(p_clinic_id,v_actor,'PatientCommunicationPreferencesViewed',v_patient_id,p_correlation_id,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
  values(p_clinic_id,'PatientCommunicationPreferencesViewed',1,'patient',v_patient_id,p_correlation_id,v_actor,v_now,jsonb_build_object('access_scope','own_preferences'));
  return jsonb_build_object(
    'schema_version',1,'clinic_id',p_clinic_id,'patient_id',v_patient_id,
    'contact_preference',v_state.contact_preference,'language',v_state.language,'time_zone',v_state.time_zone,
    'revision',coalesce(v_state.revision,0),
    'updated_at',case when v_state.updated_at is null then null else to_char(v_state.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end
  );
end $function$;

CREATE OR REPLACE FUNCTION public.read_my_patient_profile(p_clinic_id uuid, p_correlation_id uuid)
 RETURNS TABLE(id uuid, clinic_id uuid, display_name text, reference text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_patient public.patients;
  v_now timestamptz:=statement_timestamp();
begin
  if v_actor is null then raise exception using errcode='28000',message='Authentication required';end if;
  perform private.require_current_session();
  if p_clinic_id is null or p_correlation_id is null then raise exception using errcode='22023',message='Invalid profile request';end if;
  if coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid profile request';end if;

  -- Lock the verified link until this read and its audit records commit so a
  -- concurrent clinic unlink cannot race a successful patient-data response.
  select p.* into v_patient
  from public.patient_account_links l
  join public.patients p on p.clinic_id=l.clinic_id and p.id=l.patient_id
  where l.user_id=v_actor and l.clinic_id=p_clinic_id and l.verified_at is not null
  for share of l;
  if not found then return;end if;

  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
  values(v_patient.clinic_id,v_actor,'PatientProfileViewed',v_patient.id,p_correlation_id,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
  values(v_patient.clinic_id,'PatientProfileViewed',1,'patient',v_patient.id,p_correlation_id,v_actor,v_now,
    jsonb_build_object('access_scope','own_profile'));

  return query select v_patient.id,v_patient.clinic_id,v_patient.display_name,v_patient.reference;
end $function$;

CREATE OR REPLACE FUNCTION public.set_my_patient_communication_preferences(p_clinic_id uuid, p_payload jsonb, p_request_key uuid, p_correlation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_patient_id uuid;
  v_prior private.patient_communication_preference_receipts;
  v_state private.patient_communication_preferences;
  v_expected numeric;
  v_next_contact text;
  v_next_language text;
  v_next_time_zone text;
  v_normalized jsonb;
  v_revision integer;
  v_changed boolean;
  v_now timestamptz;
  v_recorded text;
  v_receipt jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='Authentication required';end if;
  perform private.require_current_session();
  if p_clinic_id is null or p_request_key is null or p_correlation_id is null or coalesce(current_setting('request.method',true),'')<>'POST' then
    raise exception using errcode='22023',message='Invalid patient preferences request';
  end if;
  select l.patient_id into v_patient_id from public.patient_account_links l
  where l.user_id=v_actor and l.clinic_id=p_clinic_id and l.verified_at is not null for share;
  if not found then raise exception using errcode='42501',message='Patient preferences unavailable';end if;
  if not exists(select 1 from private.patient_communication_settings s where s.singleton and s.enabled) then
    raise exception using errcode='PT503',message='Patient preferences are disabled';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or not(p_payload ?& array['expected_revision','contact_preference','language','time_zone'])
     or (select count(*) from jsonb_object_keys(p_payload))<>4
     or jsonb_typeof(p_payload->'expected_revision')<>'number'
     or jsonb_typeof(p_payload->'contact_preference') not in ('null','string')
     or jsonb_typeof(p_payload->'language') not in ('null','string')
     or jsonb_typeof(p_payload->'time_zone') not in ('null','string') then
    raise exception using errcode='22023',message='Invalid patient preferences request';
  end if;
  v_expected:=(p_payload->>'expected_revision')::numeric;
  v_next_contact:=p_payload->>'contact_preference';
  v_next_language:=p_payload->>'language';
  v_next_time_zone:=p_payload->>'time_zone';
  if v_expected<0 or v_expected>2147483647 or v_expected<>trunc(v_expected)
     or (v_next_contact is not null and v_next_contact not in ('phone','email','no_preference'))
     or (v_next_language is not null and v_next_language not in ('fr','ar','en','other','no_preference'))
     or (v_next_time_zone is not null and v_next_time_zone not in (
       'Africa/Casablanca','Africa/Dakar','America/New_York','America/Sao_Paulo','America/Toronto',
       'Asia/Dubai','Asia/Riyadh','Asia/Tokyo','Australia/Sydney','Etc/UTC','Europe/London','Europe/Paris'
     )) then raise exception using errcode='22023',message='Invalid patient preferences request';end if;
  v_normalized:=jsonb_build_object('expected_revision',v_expected::integer,'contact_preference',v_next_contact,'language',v_next_language,'time_zone',v_next_time_zone);

  -- The preference row serializes state transitions and same-key retries.
  insert into private.patient_communication_preferences(clinic_id,patient_id,contact_preference,language,time_zone,revision,updated_at)
  values(p_clinic_id,v_patient_id,null,null,null,0,null) on conflict(clinic_id,patient_id) do nothing;
  select * into v_state from private.patient_communication_preferences s where s.clinic_id=p_clinic_id and s.patient_id=v_patient_id for update;
  -- Recheck after obtaining the row lock so concurrent identical commands replay
  -- the committed receipt instead of incorrectly appearing stale.
  select * into v_prior from private.patient_communication_preference_receipts r
  where r.clinic_id=p_clinic_id and r.actor_id=v_actor and r.request_key=p_request_key;
  if found then
    if v_prior.patient_id<>v_patient_id or v_prior.normalized_payload<>v_normalized then raise exception using errcode='PT409',message='Patient preferences conflict';end if;
    return jsonb_build_object('receipt',v_prior.receipt,'replayed',true);
  end if;
  v_revision:=v_state.revision;
  if v_revision<>v_expected then raise exception using errcode='PT409',message='Patient preferences conflict';end if;
  v_changed:=v_state.contact_preference is distinct from v_next_contact or v_state.language is distinct from v_next_language or v_state.time_zone is distinct from v_next_time_zone;
  if v_changed and v_revision=2147483647 then raise exception using errcode='PT409',message='Patient preferences conflict';end if;
  v_now:=clock_timestamp();
  v_recorded:=to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  if v_changed then
    update private.patient_communication_preferences set contact_preference=v_next_contact,language=v_next_language,time_zone=v_next_time_zone,revision=v_revision+1,updated_at=v_now
    where clinic_id=p_clinic_id and patient_id=v_patient_id;
  end if;
  v_receipt:=jsonb_build_object(
    'clinic_id',p_clinic_id,'patient_id',v_patient_id,
    'previous_contact_preference',v_state.contact_preference,'contact_preference',v_next_contact,
    'previous_language',v_state.language,'language',v_next_language,
    'previous_time_zone',v_state.time_zone,'time_zone',v_next_time_zone,
    'previous_revision',v_revision,'revision',v_revision+case when v_changed then 1 else 0 end,
    'changed',v_changed,'recorded_at',v_recorded,'catalogue_version',1,'event_version',1
  );
  insert into private.patient_communication_preference_receipts(clinic_id,patient_id,actor_id,request_key,normalized_payload,receipt,created_at)
  values(p_clinic_id,v_patient_id,v_actor,p_request_key,v_normalized,v_receipt,v_now);
  if v_changed then
    insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
    values(p_clinic_id,v_actor,'PatientCommunicationPreferencesChanged',v_patient_id,p_correlation_id,v_now);
    insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
    values(p_clinic_id,'PatientCommunicationPreferencesChanged',1,'patient',v_patient_id,p_correlation_id,v_actor,v_now,
      jsonb_build_object('revision',v_revision+1,'changed_field_count',((v_state.contact_preference is distinct from v_next_contact)::integer+(v_state.language is distinct from v_next_language)::integer+(v_state.time_zone is distinct from v_next_time_zone)::integer)));
  end if;
  return jsonb_build_object('receipt',v_receipt,'replayed',false);
end $function$;
