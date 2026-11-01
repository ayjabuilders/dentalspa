-- Local synthetic booking lane. Uses the same authorization and lock as confirmation.
-- API/UI integration must precede enabling these commands in the local workspace.
alter table private.demo_confirmed_appointments
  drop constraint demo_confirmed_appointments_status_check,
  add constraint demo_confirmed_appointments_status_check check(status in ('confirmed','cancelled')),
  add column version integer not null default 1 check(version > 0),
  add column cancelled_at timestamptz,
  add constraint demo_appointment_cancellation_consistent check ((status='cancelled')=(cancelled_at is not null));
alter table private.demo_confirmed_appointments drop constraint demo_confirmed_provider_no_overlap;
alter table private.demo_confirmed_appointments drop constraint demo_confirmed_chair_no_overlap;
alter table private.demo_confirmed_appointments add constraint demo_confirmed_provider_no_overlap
  exclude using gist (clinic_id with =, provider_resource_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where(status='confirmed');
alter table private.demo_confirmed_appointments add constraint demo_confirmed_chair_no_overlap
  exclude using gist (clinic_id with =, chair_resource_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where(status='confirmed');

create table private.demo_appointment_command_receipts (
  clinic_id uuid not null, actor_ref uuid not null, request_key uuid not null,
  appointment_id uuid not null, canonical_payload jsonb not null, receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,actor_ref,request_key),
  foreign key(clinic_id,appointment_id) references private.demo_confirmed_appointments(clinic_id,id)
);
alter table private.demo_appointment_command_receipts enable row level security;
revoke all on private.demo_appointment_command_receipts from public,anon,authenticated;

create function public.manage_local_demo_appointment(
  p_clinic_id uuid,p_appointment_id uuid,p_action text,p_date date,p_time time,
  p_expected_version integer,p_request_key uuid,p_gate_key text
) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare
  v_actor uuid:=auth.uid(); v_appointment private.demo_confirmed_appointments;
  v_prior private.demo_appointment_command_receipts; v_payload jsonb; v_receipt jsonb;
  v_start timestamp; v_end timestamp; v_utc timestamptz;
  v_now timestamptz:=date_trunc('milliseconds',clock_timestamp()); v_event text;
begin
  if v_actor is null then raise exception using errcode='28000',message='unauthenticated'; end if;
  if p_clinic_id is null or p_appointment_id is null or p_request_key is null
    or p_action is null or p_action not in ('cancel','reschedule')
    or p_expected_version is null or p_expected_version<1
    or (p_action='cancel' and (p_date is not null or p_time is not null))
    or (p_action='reschedule' and (p_date is null or p_time is null or extract(second from p_time)<>0)) then
    raise exception using errcode='22023',message='invalid_request';
  end if;
  perform 1 from public.clinic_memberships m where m.clinic_id=p_clinic_id
    and m.user_id=v_actor and m.active and m.role in ('reception','manager') for share;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  perform 1 from private.demo_booking_confirmation_settings s where s.singleton and s.enabled
    and s.api_gate_key<>'' and s.api_gate_key=p_gate_key for share;
  if not found then raise exception using errcode='PT503',message='demo_confirmation_disabled'; end if;
  if p_clinic_id<>'10000000-0000-4000-8000-000000000001'::uuid then
    raise exception using errcode='42501',message='local_lane_unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('demo-booking-confirmation:'||p_clinic_id::text,0));
  v_payload:=jsonb_build_object('appointment_id',p_appointment_id,'action',p_action,
    'date',p_date,'time',p_time,'expected_version',p_expected_version);
  select * into v_prior from private.demo_appointment_command_receipts
    where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.canonical_payload<>v_payload then raise exception using errcode='SH410',message='idempotency_conflict'; end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  select * into v_appointment from private.demo_confirmed_appointments
    where clinic_id=p_clinic_id and id=p_appointment_id for update;
  if not found then raise exception using errcode='SH404',message='appointment_not_found'; end if;
  if v_appointment.version<>p_expected_version or v_appointment.status<>'confirmed' then
    raise exception using errcode='SH409',message='appointment_changed';
  end if;
  if p_action='reschedule' then
    v_start:=p_date+p_time; v_end:=v_start+interval '45 minutes';
    v_utc:=v_start at time zone 'Africa/Casablanca';
    if v_utc<=v_now or p_date>(v_now at time zone 'Africa/Casablanca')::date+90
      or extract(isodow from p_date)>6
      or not ((p_time>=time '09:00' and v_end::time<=time '12:00')
        or (p_time>=time '14:00' and v_end::time<=time '18:00'))
      or v_utc at time zone 'Africa/Casablanca'<>v_start then
      raise exception using errcode='22023',message='outside_sample_booking_rules';
    end if;
    perform 1 from private.demo_booking_sample_resources r where r.clinic_id=p_clinic_id
      and r.id=v_appointment.provider_resource_id and r.active and r.kind='provider' for share;
    if not found then raise exception using errcode='22023',message='inactive_resource'; end if;
    perform 1 from private.demo_booking_sample_resources r where r.clinic_id=p_clinic_id
      and r.id=v_appointment.chair_resource_id and r.active and r.kind='chair' for share;
    if not found then raise exception using errcode='22023',message='inactive_resource'; end if;
    if v_utc=v_appointment.starts_at then raise exception using errcode='22023',message='unchanged_slot'; end if;
    update private.demo_confirmed_appointments set starts_at=v_utc,ends_at=v_utc+interval '45 minutes',version=version+1
      where clinic_id=p_clinic_id and id=p_appointment_id returning * into v_appointment;
    v_event:='DemoAppointmentRescheduled';
  else
    update private.demo_confirmed_appointments set status='cancelled',cancelled_at=v_now,version=version+1
      where clinic_id=p_clinic_id and id=p_appointment_id returning * into v_appointment;
    v_event:='DemoAppointmentCancelled';
  end if;
  v_receipt:=jsonb_build_object('appointment_id',v_appointment.id,'status',v_appointment.status,
    'version',v_appointment.version,'starts_at',v_appointment.starts_at,'ends_at',v_appointment.ends_at);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
    values(p_clinic_id,v_actor,v_event,p_appointment_id,p_request_key,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,
    correlation_id,actor_ref,occurred_at,payload) values(p_clinic_id,v_event,1,'demo_confirmed_appointment',
    p_appointment_id,p_request_key,v_actor,v_now,v_receipt-'appointment_id');
  insert into private.demo_appointment_command_receipts(clinic_id,actor_ref,request_key,appointment_id,canonical_payload,receipt)
    values(p_clinic_id,v_actor,p_request_key,p_appointment_id,v_payload,v_receipt);
  return v_receipt||jsonb_build_object('replayed',false);
exception when exclusion_violation then raise exception using errcode='SH409',message='resource_conflict';
end $$;
revoke all on function public.manage_local_demo_appointment(uuid,uuid,text,date,time,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.manage_local_demo_appointment(uuid,uuid,text,date,time,integer,uuid,text) to authenticated;

-- Authoritative projections reflect later cancellation/rescheduling.
create or replace function public.list_local_patient_appointments(p_clinic_id uuid,p_from date,p_until date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;v_count integer;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='unauthenticated';end if;
  if not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=auth.uid() and active and role in ('reception','manager','dentist')) then raise exception using errcode='42501',message='forbidden';end if;
  if p_from is null or p_until is null or p_until<p_from or p_until-p_from>30 then raise exception using errcode='22023',message='invalid_range';end if;
  with limited as (
    select a.id,a.starts_at,a.ends_at,a.status,a.version,
      case when p.id is null then null else jsonb_build_object('id',p.id,'display_name',p.display_name,'reference',p.reference) end patient,
      r.display_name provider_name,c.display_name chair_name
    from private.demo_confirmed_appointments a
    left join public.patients p on p.clinic_id=a.clinic_id and p.id=a.patient_id
    join private.demo_booking_sample_resources r on r.clinic_id=a.clinic_id and r.id=a.provider_resource_id
    join private.demo_booking_sample_resources c on c.clinic_id=a.clinic_id and c.id=a.chair_resource_id
    where a.clinic_id=p_clinic_id and a.starts_at>=p_from::timestamp at time zone 'Africa/Casablanca'
      and a.starts_at<(p_until+1)::timestamp at time zone 'Africa/Casablanca'
    order by a.starts_at,a.id limit 501
  ),numbered as(select *,row_number() over(order by starts_at,id) n from limited)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'starts_at',to_char(starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'ends_at',to_char(ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'status',status,'version',version,'patient',patient,'provider_name',provider_name,'chair_name',chair_name) order by n) filter(where n<=500),'[]'::jsonb),count(*) into v_items,v_count from numbered;
  return jsonb_build_object('items',v_items,'truncated',v_count>500);
end $$;
revoke all on function public.list_local_patient_appointments(uuid,date,date) from public,anon,authenticated;
grant execute on function public.list_local_patient_appointments(uuid,date,date) to authenticated;


create or replace function public.list_demo_booking_requests(p_clinic_id uuid)
returns table (
  id uuid, scenario_id text, requested_date date, requested_time text,
  status text, created_at timestamptz, appointment jsonb
)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.scenario_id, r.requested_date, to_char(r.requested_time, 'HH24:MI'),
    case when a.id is null then 'request_received' else a.status end,
    r.created_at,
    case when a.id is null then null else jsonb_build_object(
      'id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
      'duration_minutes', a.duration_minutes, 'confirmed_at', a.confirmed_at,
      'provider_resource_id', a.provider_resource_id, 'chair_resource_id', a.chair_resource_id
    ) end
  from private.demo_booking_requests r
  left join private.demo_confirmed_appointments a
    on a.clinic_id = r.clinic_id and a.booking_request_id = r.id
  where r.clinic_id = p_clinic_id
  order by r.created_at desc, r.id
  limit 100
$$;
revoke all on function public.list_demo_booking_requests(uuid) from public, anon, authenticated;
grant execute on function public.list_demo_booking_requests(uuid) to authenticated;
