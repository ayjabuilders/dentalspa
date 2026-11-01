-- Public staff-review request stage; no capacity is reserved by a request.
-- The local API validates slots against the complete private snapshot. Under
-- the same locks as config/hold writers, SQL rejects any changed snapshot.
alter table private.agenda_configuration_gates add column public_requests_enabled boolean not null default false;
create table private.configured_booking_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  request_key uuid not null,
  visit_type_id uuid not null,
  configuration_revision integer not null,
  starts_at timestamptz not null,ends_at timestamptz not null,
  contact_name text not null check(char_length(btrim(contact_name)) between 1 and 100),
  contact_email text not null check(contact_email ~ '^[^[:space:]@]+@example[.]test$'),
  administrative_consent_version text not null check(administrative_consent_version='local-demo-v1'),
  status text not null default 'request_received' check(status='request_received'),
  canonical_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(clinic_id,request_key),unique(clinic_id,id),
  foreign key(clinic_id,configuration_revision) references private.agenda_configuration_versions(clinic_id,revision),
  check(starts_at<ends_at)
);
alter table private.configured_booking_requests enable row level security;
revoke all on private.configured_booking_requests from public,anon,authenticated;

create function public.create_local_configured_booking_request(
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
      and not exists(select 1 from private.scheduling_occupancy o join private.scheduling_holds h on h.clinic_id=o.clinic_id and h.id=o.hold_id
        where o.clinic_id=p_clinic_id and o.resource_id in ((pair->>'provider_id')::uuid,(pair->>'chair_id')::uuid)
          and o.active and h.status='held' and h.expires_at>v_now and o.period&&tstzrange(v_busy_start,v_busy_end,'[)'))) then
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
revoke all on function public.create_local_configured_booking_request(uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_local_configured_booking_request(uuid,uuid,jsonb,jsonb,text) to anon;
