begin;
-- Staff endpoints only. Public booking and its private allocation kernel remain unchanged.
create or replace function public.confirm_local_configured_booking_request(p_clinic_id uuid,p_request_id uuid,p_command_key uuid,p_expected_revision integer,p_gate_key text)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='28000',message='unauthenticated';end if;
  perform pg_advisory_xact_lock(hashtextextended('agenda-configuration:'||p_clinic_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('scheduling:'||p_clinic_id::text,0));
  -- Share locks also serialize concurrent membership revocation/gate disable.
  perform 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=v_actor
    and active and role in ('manager','reception') for share;
  if not found then raise exception using errcode='42501',message='forbidden';end if;
  perform 1 from private.agenda_configuration_gates where clinic_id=p_clinic_id and enabled and synthetic_only
    and confirmations_enabled and api_gate_key<>'' and api_gate_key=p_gate_key for share;
  if not found then raise exception using errcode='PT503',message='local_confirmation_disabled';end if;

  return private.confirm_configured_booking_request(p_clinic_id,p_request_id,p_command_key,p_expected_revision,v_actor);
end $$;

create or replace function public.cancel_local_configured_appointment(p_clinic_id uuid,p_appointment_id uuid,p_expected_version integer,p_request_key uuid,p_gate_key text)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_row private.configured_appointments;v_prior private.configured_appointment_commands;
  v_body jsonb;v_receipt jsonb;v_now timestamptz;
begin
  if v_actor is null or not exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='28000',message='unauthenticated';end if;
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

create or replace function public.reschedule_local_configured_appointment(
  p_clinic_id uuid,p_appointment_id uuid,p_expected_version integer,p_request_key uuid,
  p_expected_revision integer,p_starts_at timestamptz,p_ends_at timestamptz,p_gate_key text
) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_row private.configured_appointments;v_before private.configured_appointments;
  v_prior private.configured_appointment_commands;v_body jsonb;v_receipt jsonb;v_now timestamptz;
  v_request private.configured_booking_requests;v_settings jsonb;v_visit jsonb;v_pair jsonb;
  v_date date;v_local timestamp;v_busy_start timestamptz;v_busy_end timestamptz;v_command_key uuid:=p_request_key;
begin
  if v_actor is null or not exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='28000',message='unauthenticated';end if;
  perform pg_advisory_xact_lock(hashtextextended('agenda-configuration:'||p_clinic_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('scheduling:'||p_clinic_id::text,0));
  perform 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=v_actor and active and role in ('reception','manager') for share;
  if not found then raise exception using errcode='42501',message='forbidden';end if;
  perform 1 from private.agenda_configuration_gates where clinic_id=p_clinic_id and enabled and synthetic_only
    and confirmations_enabled and api_gate_key<>'' and api_gate_key=p_gate_key for share;
  if not found then raise exception using errcode='PT503',message='local_commands_disabled';end if;

  if p_appointment_id is null or p_request_key is null or p_expected_version is null or p_expected_version<1
    or p_expected_revision is null or p_expected_revision<1 or p_starts_at is null or p_ends_at is null
    or p_starts_at>=p_ends_at or not isfinite(p_starts_at) or not isfinite(p_ends_at) then
    raise exception using errcode='22023',message='invalid_command';end if;
  v_body:=jsonb_build_object('appointment_id',p_appointment_id,'action','reschedule','expected_version',p_expected_version,
    'expected_revision',p_expected_revision,'starts_at',private.scheduling_time(p_starts_at),'ends_at',private.scheduling_time(p_ends_at));
  select * into v_prior from private.configured_appointment_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.canonical_payload<>v_body then raise exception using errcode='SH410',message='idempotency_conflict';end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  select * into v_row from private.configured_appointments where clinic_id=p_clinic_id and id=p_appointment_id for update;
  if not found then raise exception using errcode='SH404',message='appointment_not_found';end if;
  if v_row.status<>'confirmed' or v_row.version<>p_expected_version then raise exception using errcode='SH409',message='appointment_changed';end if;
  if v_row.starts_at=p_starts_at and v_row.ends_at=p_ends_at then raise exception using errcode='22023',message='unchanged_slot';end if;
  v_before:=v_row;
  select * into strict v_request from private.configured_booking_requests where clinic_id=p_clinic_id and id=v_row.request_id;
  v_request.starts_at:=p_starts_at;v_request.ends_at:=p_ends_at;
  select configuration into v_settings from private.agenda_configuration_versions where clinic_id=p_clinic_id order by revision desc limit 1;
  -- Staff must refresh/review the current revision, never silently confirm using
  -- a changed configuration. An old request remains historically pinned.
  if (v_settings->>'revision')::integer is distinct from p_expected_revision then
    raise exception using errcode='SH409',message='configuration_changed';end if;
  select value into v_visit from jsonb_array_elements(v_settings->'visit_types')
    where value->>'id'=v_request.visit_type_id::text and value->>'active'='true' and value->>'public_bookable'='true';
  v_now:=clock_timestamp();v_local:=v_request.starts_at at time zone 'Africa/Casablanca';v_date:=v_local::date;
  if v_visit is null or v_request.ends_at-v_request.starts_at<>(v_visit->>'duration_minutes')::integer*interval '1 minute'
    or v_request.starts_at<v_now+(v_settings->>'minimum_notice_minutes')::integer*interval '1 minute'
    or v_date>(v_now at time zone 'Africa/Casablanca')::date+(v_settings->>'booking_horizon_days')::integer then
    raise exception using errcode='SH409',message='visit_no_longer_available';end if;
  v_busy_start:=v_request.starts_at-(v_visit->>'buffer_before_minutes')::integer*interval '1 minute';
  v_busy_end:=v_request.ends_at+(v_visit->>'buffer_after_minutes')::integer*interval '1 minute';
  if extract(second from v_local)<>0 or not exists(select 1 from jsonb_array_elements(v_visit->'weekly_windows') w
    where (w->>'weekday')::integer=extract(isodow from v_local) and v_local>=v_date+(w->>'start')::time
      and v_request.ends_at at time zone 'Africa/Casablanca'<=v_date+(w->>'end')::time
      and mod(extract(epoch from (v_local-(v_date+(w->>'start')::time)))::integer,(v_settings->>'slot_step_minutes')::integer*60)=0)
    or not exists(select 1 from jsonb_array_elements(v_settings->'weekly_windows') w
      where (w->>'weekday')::integer=extract(isodow from v_local)
        and v_busy_start at time zone 'Africa/Casablanca'>=v_date+(w->>'start')::time
        and v_busy_end at time zone 'Africa/Casablanca'<=v_date+(w->>'end')::time) then
    raise exception using errcode='SH409',message='outside_configured_hours';end if;
  perform private.scheduling_expire(p_clinic_id,v_now,v_command_key);
  select pair into v_pair from jsonb_array_elements(v_visit->'resource_pairs') pair
    where exists(select 1 from private.scheduling_resources r where r.clinic_id=p_clinic_id and r.id=(pair->>'provider_id')::uuid and r.active and r.synthetic_only and r.kind='provider')
      and exists(select 1 from private.scheduling_resources r where r.clinic_id=p_clinic_id and r.id=(pair->>'chair_id')::uuid and r.active and r.synthetic_only and r.kind='chair')
      and exists(select 1 from private.scheduling_windows w where w.clinic_id=p_clinic_id and w.resource_id=(pair->>'provider_id')::uuid and w.starts_at<=v_busy_start and w.ends_at>=v_busy_end)
      and exists(select 1 from private.scheduling_windows w where w.clinic_id=p_clinic_id and w.resource_id=(pair->>'chair_id')::uuid and w.starts_at<=v_busy_start and w.ends_at>=v_busy_end)
      and not exists(select 1 from jsonb_array_elements(v_settings->'closures') c where c->>'date'=v_date::text
        and (c->>'resource_id' is null or c->>'resource_id' in (pair->>'provider_id',pair->>'chair_id'))
        and v_busy_start at time zone 'Africa/Casablanca'<v_date+(c->>'end')::time
        and v_busy_end at time zone 'Africa/Casablanca'>v_date+(c->>'start')::time)
      and not exists(select 1 from private.scheduling_occupancy o where o.clinic_id=p_clinic_id
        and o.resource_id in ((pair->>'provider_id')::uuid,(pair->>'chair_id')::uuid)
        and o.appointment_id is distinct from p_appointment_id and o.active and o.period&&tstzrange(v_busy_start,v_busy_end,'[)'))
    order by pair->>'provider_id',pair->>'chair_id' limit 1;
  if v_pair is null then raise exception using errcode='SH409',message='resource_unavailable';end if;

  update private.configured_appointments set starts_at=p_starts_at,ends_at=p_ends_at,busy_starts_at=v_busy_start,busy_ends_at=v_busy_end,
    provider_resource_id=(v_pair->>'provider_id')::uuid,chair_resource_id=(v_pair->>'chair_id')::uuid,
    configuration_revision=p_expected_revision,version=version+1 where clinic_id=p_clinic_id and id=p_appointment_id returning * into v_row;
  update private.scheduling_occupancy set active=false where clinic_id=p_clinic_id and appointment_id=p_appointment_id;
  insert into private.scheduling_occupancy(clinic_id,appointment_id,resource_id,period) values
    (p_clinic_id,p_appointment_id,v_row.provider_resource_id,tstzrange(v_busy_start,v_busy_end,'[)')),
    (p_clinic_id,p_appointment_id,v_row.chair_resource_id,tstzrange(v_busy_start,v_busy_end,'[)'))
    on conflict(appointment_id,resource_id) do update set period=excluded.period,active=true;
  v_receipt:=jsonb_build_object('appointment_id',p_appointment_id,'status','confirmed','version',v_row.version,
    'starts_at',private.scheduling_time(v_row.starts_at),'ends_at',private.scheduling_time(v_row.ends_at),'replayed',false);
  insert into private.configured_appointment_commands(clinic_id,actor_ref,request_key,appointment_id,canonical_payload,receipt)
    values(p_clinic_id,v_actor,p_request_key,p_appointment_id,v_body,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
    values(p_clinic_id,v_actor,'ConfiguredAppointmentRescheduled',p_appointment_id,p_request_key,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
    values(p_clinic_id,'ConfiguredAppointmentRescheduled',1,'configured_appointment',p_appointment_id,p_request_key,v_actor,v_now,
      jsonb_build_object('status','confirmed','version',v_row.version,'previous_starts_at',private.scheduling_time(v_before.starts_at),
      'starts_at',private.scheduling_time(v_row.starts_at),'ends_at',private.scheduling_time(v_row.ends_at)));
  return v_receipt;
exception when exclusion_violation then raise exception using errcode='SH409',message='resource_unavailable';
end $$;

create or replace function public.read_local_configured_rescheduling(p_clinic_id uuid,p_appointment_id uuid,p_date date,p_gate_key text)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_row private.configured_appointments;v_snapshot jsonb;v_type uuid;
begin
  if auth.uid() is null or not exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='28000',message='unauthenticated';end if;
  if not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=auth.uid() and active and role in ('reception','manager')) then raise exception using errcode='42501',message='forbidden';end if;
  if not exists(select 1 from private.agenda_configuration_gates where clinic_id=p_clinic_id and enabled and synthetic_only and confirmations_enabled and api_gate_key<>'' and api_gate_key=p_gate_key) then raise exception using errcode='PT503',message='local_commands_disabled';end if;
  if p_date is null then raise exception using errcode='22023',message='invalid_date';end if;
  select * into v_row from private.configured_appointments where clinic_id=p_clinic_id and id=p_appointment_id;
  if not found then raise exception using errcode='SH404',message='appointment_not_found';end if;
  if v_row.status<>'confirmed' then raise exception using errcode='SH409',message='appointment_changed';end if;
  select visit_type_id into v_type from private.configured_booking_requests where clinic_id=p_clinic_id and id=v_row.request_id;
  v_snapshot:=private.agenda_availability_snapshot(p_clinic_id,p_date);
  -- Exclude only this appointment's own blocked ranges. The shared exclusion
  -- constraint guarantees no other active owner can have this resource/range.
  v_snapshot:=jsonb_set(v_snapshot,'{occupancy}',coalesce((select jsonb_agg(item) from jsonb_array_elements(v_snapshot->'occupancy') item
    where not ((item->>'resource_id')::uuid in (v_row.provider_resource_id,v_row.chair_resource_id)
      and (item->'period'->>'starts_at')::timestamptz=v_row.busy_starts_at and (item->'period'->>'ends_at')::timestamptz=v_row.busy_ends_at)),'[]'::jsonb));
  return jsonb_build_object('appointment_id',v_row.id,'version',v_row.version,'visit_type_id',v_type,
    'current_starts_at',private.scheduling_time(v_row.starts_at),'current_ends_at',private.scheduling_time(v_row.ends_at),'snapshot',v_snapshot);
end $$;

create or replace function public.list_local_configured_booking_requests(p_clinic_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;v_count integer;v_revision integer;v_enabled boolean;
begin
  if auth.uid() is null or not exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='28000',message='unauthenticated';end if;
  if not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic_id
    and user_id=auth.uid() and active and role in ('reception','manager')) then
    raise exception using errcode='42501',message='forbidden';end if;
  select max(revision) into v_revision from private.agenda_configuration_versions where clinic_id=p_clinic_id;
  select enabled and synthetic_only and confirmations_enabled into v_enabled from private.agenda_configuration_gates where clinic_id=p_clinic_id;
  with limited as (
    select r.id,r.contact_name,r.contact_email,coalesce(a.starts_at,r.starts_at) starts_at,coalesce(a.ends_at,r.ends_at) ends_at,r.created_at,r.configuration_revision,
      coalesce(a.status,'request_received') status,
      case when a.id is null then null else jsonb_build_object('id',a.id,'status',a.status,'version',a.version) end appointment,
      (select type->>'name' from jsonb_array_elements(v.configuration->'visit_types') type where type->>'id'=r.visit_type_id::text) visit_name
    from private.configured_booking_requests r
    join private.agenda_configuration_versions v on v.clinic_id=r.clinic_id and v.revision=r.configuration_revision
    left join private.configured_appointments a on a.clinic_id=r.clinic_id and a.request_id=r.id
    where r.clinic_id=p_clinic_id order by r.created_at desc,r.id limit 101
  ),numbered as(select *,row_number() over(order by created_at desc,id) n from limited)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'contact_name',contact_name,'contact_email',contact_email,
    'visit_name',visit_name,'starts_at',private.scheduling_time(starts_at),'ends_at',private.scheduling_time(ends_at),
    'status',status,'appointment',appointment,'created_at',private.scheduling_time(created_at),'configuration_revision',configuration_revision) order by n)
    filter(where n<=100),'[]'::jsonb),count(*) into v_items,v_count from numbered;
  return jsonb_build_object('items',v_items,'truncated',v_count>100,'current_revision',v_revision,'confirmation_enabled',coalesce(v_enabled,false));
end $$;

create or replace function public.list_local_patient_appointments(p_clinic_id uuid,p_from date,p_until date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;v_count integer;
begin
  if auth.uid() is null or not exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='28000',message='unauthenticated';end if;
  if not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=auth.uid() and active and role in ('reception','manager','dentist')) then raise exception using errcode='42501',message='forbidden';end if;
  if p_from is null or p_until is null or p_until<p_from or p_until-p_from>30 then raise exception using errcode='22023',message='invalid_range';end if;
  with combined as (
    select a.id,a.starts_at,a.ends_at,a.status,a.version,
      case when p.id is null then null else jsonb_build_object('id',p.id,'display_name',p.display_name,'reference',p.reference) end patient,
      r.display_name provider_name,c.display_name chair_name,'sample'::text source,null::text contact_name,null::text visit_name
    from private.demo_confirmed_appointments a
    left join public.patients p on p.clinic_id=a.clinic_id and p.id=a.patient_id
    join private.demo_booking_sample_resources r on r.clinic_id=a.clinic_id and r.id=a.provider_resource_id
    join private.demo_booking_sample_resources c on c.clinic_id=a.clinic_id and c.id=a.chair_resource_id
    where a.clinic_id=p_clinic_id and a.starts_at>=p_from::timestamp at time zone 'Africa/Casablanca'
      and a.starts_at<(p_until+1)::timestamp at time zone 'Africa/Casablanca'
    union all
    select a.id,a.starts_at,a.ends_at,a.status,a.version,null::jsonb,r.display_name,c.display_name,'configured',q.contact_name,
      (select type->>'name' from jsonb_array_elements(v.configuration->'visit_types') type where type->>'id'=q.visit_type_id::text)
    from private.configured_appointments a
    join private.configured_booking_requests q on q.clinic_id=a.clinic_id and q.id=a.request_id
    join private.agenda_configuration_versions v on v.clinic_id=a.clinic_id and v.revision=a.configuration_revision
    join private.scheduling_resources r on r.clinic_id=a.clinic_id and r.id=a.provider_resource_id
    join private.scheduling_resources c on c.clinic_id=a.clinic_id and c.id=a.chair_resource_id
    where a.clinic_id=p_clinic_id and a.starts_at>=p_from::timestamp at time zone 'Africa/Casablanca'
      and a.starts_at<(p_until+1)::timestamp at time zone 'Africa/Casablanca'
  ),limited as(select * from combined order by starts_at,id limit 501),numbered as(select *,row_number() over(order by starts_at,id) n from limited)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'starts_at',private.scheduling_time(starts_at),
    'ends_at',private.scheduling_time(ends_at),'status',status,'version',version,'patient',patient,'provider_name',provider_name,'chair_name',chair_name,
    'source',source,'contact_name',contact_name,'visit_name',visit_name) order by n) filter(where n<=500),'[]'::jsonb),count(*) into v_items,v_count from numbered;
  return jsonb_build_object('items',v_items,'truncated',v_count>500);
end $$;

commit;
