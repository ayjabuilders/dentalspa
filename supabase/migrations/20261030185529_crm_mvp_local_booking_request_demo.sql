-- Local synthetic booking requests only. Public requests contain no identity,
-- contact, clinical, patient-link or resource-hold data.
create table private.demo_booking_request_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  api_gate_key text not null default ''
);
insert into private.demo_booking_request_settings(singleton, enabled) values (true, false);
alter table private.demo_booking_request_settings enable row level security;
revoke all on private.demo_booking_request_settings from public, anon, authenticated;

create function private.demo_booking_request_writes_enabled() returns boolean
language sql volatile security definer set search_path = '' as $$
  select coalesce((select enabled from private.demo_booking_request_settings where singleton), false)
$$;
revoke all on function private.demo_booking_request_writes_enabled() from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.demo_booking_request_writes_enabled() to anon, authenticated;

create function private.demo_booking_request_gate_valid(p_gate_key text) returns boolean
language sql volatile security definer set search_path = '' as $$
  select coalesce((select enabled and api_gate_key <> '' and api_gate_key = p_gate_key
    from private.demo_booking_request_settings where singleton), false)
$$;
revoke all on function private.demo_booking_request_gate_valid(text) from public, anon, authenticated;
grant execute on function private.demo_booking_request_gate_valid(text) to anon;

create table private.demo_booking_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null default '10000000-0000-4000-8000-000000000001'::uuid references public.clinics(id),
  request_key uuid not null,
  scenario_id text not null check (scenario_id in ('salma', 'youssef', 'imane')),
  requested_date date not null,
  requested_time time without time zone not null,
  status text not null default 'request_received' check (status = 'request_received'),
  created_at timestamptz not null default now(),
  unique (clinic_id, request_key),
  check (requested_date between current_date and current_date + 90),
  check (requested_time >= time '08:00' and requested_time <= time '19:00')
);
alter table private.demo_booking_requests enable row level security;
revoke all on private.demo_booking_requests from public, anon, authenticated;
grant insert (request_key, scenario_id, requested_date, requested_time) on private.demo_booking_requests to anon;
grant select (id, clinic_id, scenario_id, requested_date, requested_time, status, created_at) on private.demo_booking_requests to authenticated;

create policy demo_booking_request_public_create on private.demo_booking_requests
  for insert to anon with check (
    clinic_id = '10000000-0000-4000-8000-000000000001'::uuid
    and scenario_id in ('salma', 'youssef', 'imane')
    and status = 'request_received'
    and private.demo_booking_request_writes_enabled()
  );
create policy demo_booking_request_staff_read on private.demo_booking_requests
  for select to authenticated using (
    exists (
      select 1 from public.clinic_memberships m
      where m.clinic_id = demo_booking_requests.clinic_id
        and m.user_id = (select auth.uid()) and m.active
        and m.role in ('reception', 'manager')
    )
  );

create function private.audit_demo_booking_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.audit_events(clinic_id, actor_ref, action, aggregate_id, correlation_id, occurred_at)
  values (new.clinic_id, '00000000-0000-0000-0000-000000000000'::uuid,
    'DemoBookingRequestReceived', new.id, new.request_key, new.created_at);
  insert into private.outbox_events(
    clinic_id, event_type, event_version, aggregate_type, aggregate_id,
    correlation_id, actor_ref, occurred_at, payload
  ) values (
    new.clinic_id, 'DemoBookingRequestReceived', 1, 'demo_booking_request', new.id,
    new.request_key, '00000000-0000-0000-0000-000000000000'::uuid, new.created_at,
    jsonb_build_object('scenario_id', new.scenario_id, 'requested_date', new.requested_date,
      'requested_time', to_char(new.requested_time, 'HH24:MI'), 'status', new.status)
  );
  return new;
end
$$;
revoke all on function private.audit_demo_booking_request() from public, anon, authenticated;
create trigger demo_booking_request_audit_outbox
  after insert on private.demo_booking_requests
  for each row execute function private.audit_demo_booking_request();

-- This public RPC is deliberately SECURITY INVOKER. Its only write capability
-- comes from narrow column grants and the RLS policy above; duplicate keys do
-- not create another row/event and receive the same generic acknowledgement.
create function public.create_demo_booking_request(
  p_request_key uuid, p_scenario_id text, p_requested_date text, p_requested_time text, p_gate_key text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if not private.demo_booking_request_gate_valid(p_gate_key) then
    raise exception using errcode = '42501', message = 'demo booking request is disabled';
  end if;
  if p_request_key is null or p_scenario_id is null or p_scenario_id not in ('salma', 'youssef', 'imane')
     or p_requested_date !~ '^\d{4}-\d{2}-\d{2}$'
     or p_requested_time !~ '^((0[8-9]|1[0-8]):[0-5]\d|19:00)$' then
    raise exception using errcode = '22023', message = 'invalid demo booking request';
  end if;
  begin
    insert into private.demo_booking_requests(request_key, scenario_id, requested_date, requested_time)
    values (p_request_key, p_scenario_id, p_requested_date::date, p_requested_time::time);
  exception when unique_violation then
    -- A retry of the same key creates no second row, audit event, or outbox event.
    null;
  end;
  return jsonb_build_object('status', 'request_received');
end
$$;
revoke all on function public.create_demo_booking_request(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_demo_booking_request(uuid, text, text, text, text) to anon;

create function public.list_demo_booking_requests(p_clinic_id uuid)
returns table (
  id uuid, scenario_id text, requested_date date, requested_time text,
  status text, created_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.scenario_id, r.requested_date, to_char(r.requested_time, 'HH24:MI'), r.status, r.created_at
  from private.demo_booking_requests r
  where r.clinic_id = p_clinic_id
  order by r.created_at desc, r.id
  limit 100
$$;
revoke all on function public.list_demo_booking_requests(uuid) from public, anon, authenticated;
grant execute on function public.list_demo_booking_requests(uuid) to authenticated;
