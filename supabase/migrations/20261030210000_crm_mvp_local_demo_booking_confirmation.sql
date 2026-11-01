-- A local-only demonstration transition from a synthetic request to a
-- synthetic confirmed appointment. It never links a patient or clinical data.
create table private.demo_booking_confirmation_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  api_gate_key text not null default ''
);
insert into private.demo_booking_confirmation_settings(singleton, enabled) values (true, false);
alter table private.demo_booking_confirmation_settings enable row level security;
revoke all on private.demo_booking_confirmation_settings from public, anon, authenticated;

alter table private.demo_booking_requests
  add constraint demo_booking_requests_clinic_id_unique unique (clinic_id, id);

create table private.demo_booking_sample_resources (
  id uuid primary key,
  clinic_id uuid not null default '10000000-0000-4000-8000-000000000001'::uuid references public.clinics(id),
  kind text not null check (kind in ('provider', 'chair')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  active boolean not null default true,
  unique (clinic_id, id),
  unique (clinic_id, id, kind)
);
alter table private.demo_booking_sample_resources enable row level security;
revoke all on private.demo_booking_sample_resources from public, anon, authenticated;

create table private.demo_confirmed_appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null default '10000000-0000-4000-8000-000000000001'::uuid,
  booking_request_id uuid not null,
  scenario_id text not null check (scenario_id in ('salma', 'youssef', 'imane')),
  provider_resource_id uuid not null,
  chair_resource_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes integer not null default 45 check (duration_minutes = 45),
  status text not null default 'confirmed' check (status = 'confirmed'),
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default clock_timestamp(),
  unique (clinic_id, booking_request_id),
  unique (clinic_id, id),
  foreign key (clinic_id, booking_request_id) references private.demo_booking_requests(clinic_id, id),
  foreign key (clinic_id, provider_resource_id) references private.demo_booking_sample_resources(clinic_id, id),
  foreign key (clinic_id, chair_resource_id) references private.demo_booking_sample_resources(clinic_id, id),
  check (provider_resource_id <> chair_resource_id),
  check (starts_at < ends_at and ends_at - starts_at = interval '45 minutes')
);
alter table private.demo_confirmed_appointments enable row level security;
revoke all on private.demo_confirmed_appointments from public, anon, authenticated;
grant select (id, clinic_id, booking_request_id, scenario_id, provider_resource_id,
  chair_resource_id, starts_at, ends_at, duration_minutes, status, confirmed_by, confirmed_at)
  on private.demo_confirmed_appointments to authenticated;
create policy demo_confirmed_appointment_staff_read on private.demo_confirmed_appointments
  for select to authenticated using (
    exists (select 1 from public.clinic_memberships m
      where m.clinic_id = demo_confirmed_appointments.clinic_id
        and m.user_id = (select auth.uid()) and m.active
        and m.role in ('reception', 'manager'))
  );
create index demo_confirmed_appointments_clinic_start on private.demo_confirmed_appointments(clinic_id, starts_at);
alter table private.demo_confirmed_appointments add constraint demo_confirmed_provider_no_overlap
  exclude using gist (clinic_id with =, provider_resource_id with =, tstzrange(starts_at, ends_at, '[)') with &&);
alter table private.demo_confirmed_appointments add constraint demo_confirmed_chair_no_overlap
  exclude using gist (clinic_id with =, chair_resource_id with =, tstzrange(starts_at, ends_at, '[)') with &&);

create table private.demo_booking_confirmation_idempotency (
  clinic_id uuid not null,
  actor_ref uuid not null,
  request_key uuid not null,
  booking_request_id uuid not null,
  canonical_payload jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (clinic_id, actor_ref, request_key),
  foreign key (clinic_id, booking_request_id) references private.demo_booking_requests(clinic_id, id)
);
alter table private.demo_booking_confirmation_idempotency enable row level security;
revoke all on private.demo_booking_confirmation_idempotency from public, anon, authenticated;

create function public.confirm_demo_booking_request(
  p_clinic_id uuid, p_booking_request_id uuid, p_provider_resource_id uuid,
  p_chair_resource_id uuid, p_request_key uuid, p_gate_key text
) returns jsonb
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
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
$$;
revoke all on function public.confirm_demo_booking_request(uuid,uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.confirm_demo_booking_request(uuid,uuid,uuid,uuid,uuid,text) to authenticated;

drop function public.list_demo_booking_requests(uuid);
create function public.list_demo_booking_requests(p_clinic_id uuid)
returns table (
  id uuid, scenario_id text, requested_date date, requested_time text,
  status text, created_at timestamptz, appointment jsonb
)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.scenario_id, r.requested_date, to_char(r.requested_time, 'HH24:MI'),
    case when a.id is null then 'request_received' else 'confirmed' end,
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
