-- Local synthetic configured appointments share resource exclusion with temporary
-- holds. Appointment occupancy is not a hold and never expires with a hold TTL.
alter table private.agenda_configuration_gates add column confirmations_enabled boolean not null default false;
create table private.configured_appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  request_id uuid not null,
  configuration_revision integer not null,
  provider_resource_id uuid not null, chair_resource_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  busy_starts_at timestamptz not null, busy_ends_at timestamptz not null,
  status text not null default 'confirmed' check(status in ('confirmed','cancelled')),
  version integer not null default 1 check(version>0),
  actor_ref uuid not null, created_at timestamptz not null default clock_timestamp(),
  unique(clinic_id,id), unique(clinic_id,request_id),
  foreign key(clinic_id,request_id) references private.configured_booking_requests(clinic_id,id),
  foreign key(clinic_id,configuration_revision) references private.agenda_configuration_versions(clinic_id,revision),
  foreign key(clinic_id,provider_resource_id) references private.scheduling_resources(clinic_id,id),
  foreign key(clinic_id,chair_resource_id) references private.scheduling_resources(clinic_id,id),
  check(busy_starts_at<=starts_at and starts_at<ends_at and ends_at<=busy_ends_at),
  check(provider_resource_id<>chair_resource_id)
);
create index configured_appointments_calendar on private.configured_appointments(clinic_id,starts_at,id);
create table private.configured_booking_confirmations (
  clinic_id uuid not null references public.clinics(id), actor_ref uuid not null,
  command_key uuid not null, request_id uuid not null, expected_revision integer not null,
  receipt jsonb not null, created_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,actor_ref,command_key),
  foreign key(clinic_id,request_id) references private.configured_booking_requests(clinic_id,id)
);
alter table private.configured_appointments enable row level security;
alter table private.configured_booking_confirmations enable row level security;
revoke all on private.configured_appointments,private.configured_booking_confirmations from public,anon,authenticated;

-- Preserve existing hold uniqueness and exclusion; give each row exactly one
-- owner. Both kinds remain subject to the same GiST exclusion constraint.
alter table private.scheduling_occupancy drop constraint scheduling_occupancy_pkey;
alter table private.scheduling_occupancy alter column hold_id drop not null;
alter table private.scheduling_occupancy add column id uuid not null default gen_random_uuid() primary key;
alter table private.scheduling_occupancy add constraint scheduling_occupancy_hold_resource unique(hold_id,resource_id);
alter table private.scheduling_occupancy add column appointment_id uuid;
alter table private.scheduling_occupancy add constraint scheduling_occupancy_appointment_fk
  foreign key(clinic_id,appointment_id) references private.configured_appointments(clinic_id,id);
alter table private.scheduling_occupancy add constraint scheduling_occupancy_appointment_resource unique(appointment_id,resource_id);
alter table private.scheduling_occupancy add constraint scheduling_occupancy_one_owner
  check((hold_id is null)<>(appointment_id is null));

create function public.confirm_local_configured_booking_request(
  p_clinic_id uuid,p_request_id uuid,p_command_key uuid,p_expected_revision integer,p_gate_key text
) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
  v_actor uuid:=auth.uid(); v_now timestamptz;
  v_request private.configured_booking_requests; v_prior private.configured_booking_confirmations;
  v_appointment private.configured_appointments;v_settings jsonb;v_visit jsonb;v_pair jsonb;
  v_date date;v_local timestamp;v_busy_start timestamptz;v_busy_end timestamptz;v_receipt jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='unauthenticated';end if;
  perform pg_advisory_xact_lock(hashtextextended('agenda-configuration:'||p_clinic_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('scheduling:'||p_clinic_id::text,0));
  -- Share locks also serialize concurrent membership revocation/gate disable.
  perform 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=v_actor
    and active and role in ('manager','reception') for share;
  if not found then raise exception using errcode='42501',message='forbidden';end if;
  perform 1 from private.agenda_configuration_gates where clinic_id=p_clinic_id and enabled and synthetic_only
    and confirmations_enabled and api_gate_key<>'' and api_gate_key=p_gate_key for share;
  if not found then raise exception using errcode='PT503',message='local_confirmation_disabled';end if;
  if p_request_id is null or p_command_key is null or p_expected_revision is null or p_expected_revision<1 then
    raise exception using errcode='22023',message='invalid_confirmation';end if;
  select * into v_prior from private.configured_booking_confirmations
    where clinic_id=p_clinic_id and actor_ref=v_actor and command_key=p_command_key;
  if found then
    if v_prior.request_id<>p_request_id or v_prior.expected_revision<>p_expected_revision then
      raise exception using errcode='SH410',message='idempotency_conflict';end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  select * into v_request from private.configured_booking_requests where clinic_id=p_clinic_id and id=p_request_id for update;
  if not found then raise exception using errcode='SH404',message='request_not_found';end if;
  if exists(select 1 from private.configured_appointments where clinic_id=p_clinic_id and request_id=p_request_id) then
    raise exception using errcode='SH409',message='request_already_confirmed';end if;
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
  perform private.scheduling_expire(p_clinic_id,v_now,p_command_key);
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
        and o.active and o.period&&tstzrange(v_busy_start,v_busy_end,'[)'))
    order by pair->>'provider_id',pair->>'chair_id' limit 1;
  if v_pair is null then raise exception using errcode='SH409',message='resource_unavailable';end if;
  insert into private.configured_appointments(clinic_id,request_id,configuration_revision,provider_resource_id,chair_resource_id,
    starts_at,ends_at,busy_starts_at,busy_ends_at,actor_ref)
    values(p_clinic_id,p_request_id,p_expected_revision,(v_pair->>'provider_id')::uuid,(v_pair->>'chair_id')::uuid,
      v_request.starts_at,v_request.ends_at,v_busy_start,v_busy_end,v_actor) returning * into v_appointment;
  insert into private.scheduling_occupancy(clinic_id,appointment_id,resource_id,period) values
    (p_clinic_id,v_appointment.id,v_appointment.provider_resource_id,tstzrange(v_busy_start,v_busy_end,'[)')),
    (p_clinic_id,v_appointment.id,v_appointment.chair_resource_id,tstzrange(v_busy_start,v_busy_end,'[)'));
  v_receipt:=jsonb_build_object('request_id',p_request_id,'appointment_id',v_appointment.id,'status','confirmed','version',1,
    'starts_at',private.scheduling_time(v_appointment.starts_at),'ends_at',private.scheduling_time(v_appointment.ends_at),'replayed',false);
  insert into private.configured_booking_confirmations(clinic_id,actor_ref,command_key,request_id,expected_revision,receipt)
    values(p_clinic_id,v_actor,p_command_key,p_request_id,p_expected_revision,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
    values(p_clinic_id,v_actor,'ConfiguredBookingConfirmed',v_appointment.id,p_command_key,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
    values(p_clinic_id,'ConfiguredBookingConfirmed',1,'configured_appointment',v_appointment.id,p_command_key,v_actor,v_now,
      jsonb_build_object('status','confirmed','request_id',p_request_id,'configuration_revision',p_expected_revision));
  return v_receipt;
exception when exclusion_violation then raise exception using errcode='SH409',message='resource_unavailable';
end $$;
revoke all on function public.confirm_local_configured_booking_request(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.confirm_local_configured_booking_request(uuid,uuid,uuid,integer,text) to authenticated;

-- Include persistent appointment occupancy as well as live temporary holds.
create or replace function public.scheduling_availability(p_clinic_id uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_body jsonb;v_start timestamptz;v_end timestamptz;v_now timestamptz;v_provider uuid;v_chair uuid;v_config private.scheduling_settings;
 v_providers tstzmultirange;v_chairs tstzmultirange;v_busy tstzmultirange;v_free tstzmultirange;v_items jsonb;v_count integer;
begin
 perform private.require_scheduling(p_clinic_id);v_now:=date_trunc('milliseconds',clock_timestamp());v_body:=private.scheduling_normalize(p_request,true);
 v_start:=(v_body->>'window_starts_at')::timestamptz;v_end:=(v_body->>'window_ends_at')::timestamptz;v_provider:=(v_body->>'provider_resource_id')::uuid;v_chair:=(v_body->>'chair_resource_id')::uuid;
 select * into strict v_config from private.scheduling_settings where clinic_id=p_clinic_id;
 if v_start<v_now or v_end>v_now+v_config.horizon_seconds*interval '1 second' or v_end-v_start>v_config.max_search_seconds*interval '1 second' then raise exception using errcode='22023',message='invalid_request';end if;
 perform private.scheduling_validate_pair(p_clinic_id,v_provider,v_chair);
 select coalesce(range_agg(tstzrange(starts_at,ends_at,'[)')),'{}'::tstzmultirange) into v_providers from private.scheduling_windows where clinic_id=p_clinic_id and resource_id=v_provider;
 select coalesce(range_agg(tstzrange(starts_at,ends_at,'[)')),'{}'::tstzmultirange) into v_chairs from private.scheduling_windows where clinic_id=p_clinic_id and resource_id=v_chair;
 select coalesce(range_agg(o.period),'{}'::tstzmultirange) into v_busy from private.scheduling_occupancy o left join private.scheduling_holds h on h.id=o.hold_id and h.clinic_id=o.clinic_id
 where o.clinic_id=p_clinic_id and o.resource_id in(v_provider,v_chair) and o.active and (o.appointment_id is not null or (h.status='held' and h.expires_at>v_now));
 v_free:=(v_providers*v_chairs*tstzmultirange(tstzrange(v_start,v_end,'[)')))-v_busy;
 with limited as(select r from unnest(v_free) r order by lower(r) limit 201),numbered as(select r,row_number()over(order by lower(r)) n from limited)
 select coalesce(jsonb_agg(jsonb_build_object('starts_at',private.scheduling_time(lower(r)),'ends_at',private.scheduling_time(upper(r))) order by lower(r)) filter(where n<=200),'[]'::jsonb),count(*) into v_items,v_count from numbered;
 return v_body||jsonb_build_object('observed_at',private.scheduling_time(v_now),'informational',true,'intervals',v_items,'truncated',v_count>200);
end $$;

-- Include persistent appointment occupancy as well as live temporary holds.
create or replace function private.agenda_availability_snapshot(p_clinic_id uuid,p_date date)
returns jsonb language plpgsql set search_path='' as $$
declare v_now timestamptz := statement_timestamp(); v_from timestamptz; v_to timestamptz; v_result jsonb;
begin
  if p_date is null then raise exception using errcode='22023',message='invalid_date'; end if;
  v_from := p_date::timestamp at time zone 'Africa/Casablanca';
  v_to := (p_date+1)::timestamp at time zone 'Africa/Casablanca';
  select jsonb_build_object(
    'clinic_id',p_clinic_id,
    'now',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'settings',(select configuration from private.agenda_configuration_versions where clinic_id=p_clinic_id order by revision desc limit 1),
    'resources',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'clinic_id',r.clinic_id,'kind',r.kind,'active',r.active,
      'windows',coalesce((select jsonb_agg(jsonb_build_object(
        'starts_at',to_char(w.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'ends_at',to_char(w.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by w.starts_at)
        from private.scheduling_windows w where w.clinic_id=p_clinic_id and w.resource_id=r.id and w.starts_at<v_to and w.ends_at>v_from),'[]'::jsonb)) order by r.id)
      from private.scheduling_resources r where r.clinic_id=p_clinic_id and r.synthetic_only),'[]'::jsonb),
    'occupancy',coalesce((select jsonb_agg(jsonb_build_object(
      'clinic_id',o.clinic_id,'resource_id',o.resource_id,'period',jsonb_build_object(
        'starts_at',to_char(lower(o.period) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'ends_at',to_char(upper(o.period) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))))
      from private.scheduling_occupancy o left join private.scheduling_holds h on h.clinic_id=o.clinic_id and h.id=o.hold_id
      where o.clinic_id=p_clinic_id and o.active and (o.appointment_id is not null or (h.status='held' and h.expires_at>v_now))
        and o.period && tstzrange(v_from,v_to,'[)')),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- Include persistent appointment occupancy as well as live temporary holds.
create or replace function public.create_local_configured_booking_request(
  p_clinic_id uuid,p_request_key uuid,p_payload jsonb,p_validated_snapshot jsonb,p_gate_key text
) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
  v_prior private.configured_booking_requests;v_row private.configured_booking_requests;
  v_snapshot jsonb;v_settings jsonb;v_visit jsonb;v_now timestamptz;
  v_start timestamptz;v_end timestamptz;v_date date;v_revision integer;
  v_local timestamp;v_busy_start timestamptz;v_busy_end timestamptz;
  v_system constant uuid:='00000000-0000-4000-8000-000000000001';
begin
  perform pg_advisory_xact_lock(hashtextextended('agenda-configuration:'||p_clinic_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('scheduling:'||p_clinic_id::text,0));
  perform 1 from private.agenda_configuration_gates g where g.clinic_id=p_clinic_id
    and g.enabled and g.synthetic_only and g.public_discovery_enabled and g.public_requests_enabled
    and g.public_api_gate_key<>'' and g.public_api_gate_key=p_gate_key for share;
  if not found then raise exception using errcode='PT503',message='local_public_requests_disabled';end if;
  if p_request_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or not(p_payload ?& array['visit_type_id','configuration_revision','starts_at','ends_at','contact_name','contact_email','administrative_consent_version'])
    or (select count(*) from jsonb_object_keys(p_payload))<>7
    or p_payload->>'administrative_consent_version' is distinct from 'local-demo-v1'
    or char_length(btrim(coalesce(p_payload->>'contact_name',''))) not between 1 and 100
    or coalesce(p_payload->>'contact_email','') !~ '^[^[:space:]@]+@example[.]test$' then
    raise exception using errcode='22023',message='invalid_synthetic_request';
  end if;
  select * into v_prior from private.configured_booking_requests where clinic_id=p_clinic_id and request_key=p_request_key;
  if found then
    if v_prior.canonical_payload<>p_payload then raise exception using errcode='SH410',message='idempotency_conflict';end if;
    return jsonb_build_object('request_id',v_prior.id,'status',v_prior.status,'replayed',true);
  end if;
  v_start:=(p_payload->>'starts_at')::timestamptz;v_end:=(p_payload->>'ends_at')::timestamptz;
  v_date:=(v_start at time zone 'Africa/Casablanca')::date;
  v_revision:=(p_payload->>'configuration_revision')::integer;
  v_now:=clock_timestamp();
  v_snapshot:=private.agenda_availability_snapshot(p_clinic_id,v_date);
  -- The API capability is server-only. A browser cannot assert its own snapshot.
  if p_validated_snapshot is null or (v_snapshot-'now') is distinct from (p_validated_snapshot-'now') then
    raise exception using errcode='SH409',message='availability_changed';
  end if;
  v_settings:=v_snapshot->'settings';
  if (v_settings->>'revision')::integer is distinct from v_revision then raise exception using errcode='SH409',message='configuration_changed';end if;
  if v_settings->>'confirmation_mode' is distinct from 'staff_review' then
    raise exception using errcode='PT503',message='automatic_confirmation_not_enabled';
  end if;
  select value into v_visit from jsonb_array_elements(v_settings->'visit_types')
    where value->>'id'=p_payload->>'visit_type_id' and value->>'active'='true' and value->>'public_bookable'='true';
  if v_visit is null or v_start is null or v_end is null or v_end-v_start<>(v_visit->>'duration_minutes')::integer*interval '1 minute'
    or v_start<v_now+(v_settings->>'minimum_notice_minutes')::integer*interval '1 minute'
    or v_date>(v_now at time zone 'Africa/Casablanca')::date+(v_settings->>'booking_horizon_days')::integer then
    raise exception using errcode='22023',message='invalid_public_visit';
  end if;
  v_local:=v_start at time zone 'Africa/Casablanca';
  v_busy_start:=v_start-(v_visit->>'buffer_before_minutes')::integer*interval '1 minute';
  v_busy_end:=v_end+(v_visit->>'buffer_after_minutes')::integer*interval '1 minute';
  if extract(second from v_local)<>0 or not exists(select 1 from jsonb_array_elements(v_visit->'weekly_windows') w
    where (w->>'weekday')::integer=extract(isodow from v_local)
      and v_local>=v_date+(w->>'start')::time
      and v_end at time zone 'Africa/Casablanca'<=v_date+(w->>'end')::time
      and mod(extract(epoch from (v_local-(v_date+(w->>'start')::time)))::integer,(v_settings->>'slot_step_minutes')::integer*60)=0)
    or not exists(select 1 from jsonb_array_elements(v_settings->'weekly_windows') w
      where (w->>'weekday')::integer=extract(isodow from v_local)
        and v_busy_start at time zone 'Africa/Casablanca'>=v_date+(w->>'start')::time
        and v_busy_end at time zone 'Africa/Casablanca'<=v_date+(w->>'end')::time) then
    raise exception using errcode='22023',message='outside_configured_hours';
  end if;
  if not exists(select 1 from jsonb_array_elements(v_visit->'resource_pairs') pair
    where exists(select 1 from private.scheduling_resources r where r.clinic_id=p_clinic_id and r.id=(pair->>'provider_id')::uuid and r.active and r.synthetic_only and r.kind='provider')
      and exists(select 1 from private.scheduling_resources r where r.clinic_id=p_clinic_id and r.id=(pair->>'chair_id')::uuid and r.active and r.synthetic_only and r.kind='chair')
      and exists(select 1 from private.scheduling_windows w where w.clinic_id=p_clinic_id and w.resource_id=(pair->>'provider_id')::uuid and w.starts_at<=v_busy_start and w.ends_at>=v_busy_end)
      and exists(select 1 from private.scheduling_windows w where w.clinic_id=p_clinic_id and w.resource_id=(pair->>'chair_id')::uuid and w.starts_at<=v_busy_start and w.ends_at>=v_busy_end)
      and not exists(select 1 from jsonb_array_elements(v_settings->'closures') c where c->>'date'=v_date::text
        and (c->>'resource_id' is null or c->>'resource_id' in (pair->>'provider_id',pair->>'chair_id'))
        and v_busy_start at time zone 'Africa/Casablanca'<v_date+(c->>'end')::time
        and v_busy_end at time zone 'Africa/Casablanca'>v_date+(c->>'start')::time)
      and not exists(select 1 from private.scheduling_occupancy o left join private.scheduling_holds h on h.clinic_id=o.clinic_id and h.id=o.hold_id
        where o.clinic_id=p_clinic_id and o.resource_id in ((pair->>'provider_id')::uuid,(pair->>'chair_id')::uuid)
          and o.active and (o.appointment_id is not null or (h.status='held' and h.expires_at>v_now)) and o.period&&tstzrange(v_busy_start,v_busy_end,'[)'))) then
    raise exception using errcode='SH409',message='resource_unavailable';
  end if;
  insert into private.configured_booking_requests(clinic_id,request_key,visit_type_id,configuration_revision,
    starts_at,ends_at,contact_name,contact_email,administrative_consent_version,canonical_payload)
    values(p_clinic_id,p_request_key,(p_payload->>'visit_type_id')::uuid,v_revision,v_start,v_end,
      btrim(p_payload->>'contact_name'),p_payload->>'contact_email','local-demo-v1',p_payload) returning * into v_row;
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
    values(p_clinic_id,v_system,'ConfiguredBookingRequested',v_row.id,p_request_key,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
    values(p_clinic_id,'ConfiguredBookingRequested',1,'configured_booking_request',v_row.id,p_request_key,v_system,v_now,
      jsonb_build_object('status','request_received','configuration_revision',v_revision,'visit_type_id',v_row.visit_type_id));
  return jsonb_build_object('request_id',v_row.id,'status',v_row.status,'replayed',false);
end $$;
