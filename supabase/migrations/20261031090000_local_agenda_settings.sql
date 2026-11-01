-- Local synthetic configuration only. Activation requires a server-only gate.
create table private.agenda_configuration_gates (
  clinic_id uuid primary key references public.clinics(id),
  enabled boolean not null default false,
  api_gate_key text not null default '',
  public_discovery_enabled boolean not null default false,
  public_api_gate_key text not null default '',
  synthetic_only boolean not null default true check(synthetic_only)
);
create table private.agenda_configuration_versions (
  clinic_id uuid not null references public.clinics(id),
  revision integer not null check(revision > 0),
  configuration jsonb not null check(jsonb_typeof(configuration) = 'object'),
  actor_ref uuid not null,
  request_key uuid not null,
  saved_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id, revision),
  unique(clinic_id, actor_ref, request_key)
);
alter table private.agenda_configuration_gates enable row level security;
alter table private.agenda_configuration_versions enable row level security;
revoke all on private.agenda_configuration_gates, private.agenda_configuration_versions from public, anon, authenticated;

create function private.authorize_agenda_configuration(p_clinic_id uuid, p_gate_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode='28000', message='unauthenticated'; end if;
  perform 1 from public.clinic_memberships m where m.clinic_id=p_clinic_id
    and m.user_id=v_actor and m.active and m.role='manager' for key share;
  if not found then raise exception using errcode='42501', message='forbidden'; end if;
  if not exists(select 1 from private.agenda_configuration_gates g where g.clinic_id=p_clinic_id
    and g.enabled and g.synthetic_only and g.api_gate_key<>'' and g.api_gate_key=p_gate_key) then
    raise exception using errcode='PT503', message='local_configuration_disabled';
  end if;
  return v_actor;
end $$;
revoke all on function private.authorize_agenda_configuration(uuid,text) from public, anon, authenticated;

create function public.read_local_agenda_configuration(p_clinic_id uuid,p_gate_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_configuration jsonb;
begin
  perform private.authorize_agenda_configuration(p_clinic_id,p_gate_key);
  select configuration into v_configuration from private.agenda_configuration_versions
    where clinic_id=p_clinic_id order by revision desc limit 1;
  return jsonb_build_object('settings',v_configuration);
end $$;

create function public.save_local_agenda_configuration(
  p_clinic_id uuid,p_expected_revision integer,p_configuration jsonb,p_request_key uuid,p_gate_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;
  v_prior private.agenda_configuration_versions;
  v_revision integer;
  v_type jsonb;
  v_pair jsonb;
  v_closure jsonb;
  v_now timestamptz := clock_timestamp();
begin
  v_actor := private.authorize_agenda_configuration(p_clinic_id,p_gate_key);
  -- The gate is held only by the local API which validates the full versioned
  -- settings contract. UUID/tenant integrity and revision are checked again here.
  if p_request_key is null or p_expected_revision is null or p_expected_revision<0
    or p_configuration is null or jsonb_typeof(p_configuration)<>'object'
    or p_configuration->>'schema_version' is distinct from '1'
    or p_configuration->>'revision' is distinct from (p_expected_revision+1)::text
    or jsonb_typeof(p_configuration->'visit_types') is distinct from 'array'
    or jsonb_typeof(p_configuration->'closures') is distinct from 'array' then
    raise exception using errcode='22023', message='invalid_configuration';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agenda-configuration:'||p_clinic_id::text,0));
  select * into v_prior from private.agenda_configuration_versions
    where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.configuration<>p_configuration or v_prior.revision<>p_expected_revision+1 then
      raise exception using errcode='SH410', message='idempotency_conflict';
    end if;
    return jsonb_build_object('settings',v_prior.configuration,'replayed',true);
  end if;
  select coalesce(max(revision),0) into v_revision from private.agenda_configuration_versions where clinic_id=p_clinic_id;
  if v_revision<>p_expected_revision then raise exception using errcode='SH409', message='configuration_changed'; end if;
  for v_type in select value from jsonb_array_elements(p_configuration->'visit_types') loop
    if jsonb_typeof(v_type->'resource_pairs') is distinct from 'array' then
      raise exception using errcode='22023', message='invalid_resources';
    end if;
    for v_pair in select value from jsonb_array_elements(v_type->'resource_pairs') loop
      if not exists(select 1 from private.scheduling_resources r where r.clinic_id=p_clinic_id
        and r.id=(v_pair->>'provider_id')::uuid and r.kind='provider' and r.active and r.synthetic_only)
        or not exists(select 1 from private.scheduling_resources r where r.clinic_id=p_clinic_id
        and r.id=(v_pair->>'chair_id')::uuid and r.kind='chair' and r.active and r.synthetic_only) then
        raise exception using errcode='42501', message='resource_scope_denied';
      end if;
    end loop;
  end loop;
  for v_closure in select value from jsonb_array_elements(p_configuration->'closures') loop
    if v_closure->>'resource_id' is not null and not exists(select 1 from private.scheduling_resources r
      where r.clinic_id=p_clinic_id and r.id=(v_closure->>'resource_id')::uuid and r.synthetic_only) then
      raise exception using errcode='42501', message='resource_scope_denied';
    end if;
  end loop;
  insert into private.agenda_configuration_versions(clinic_id,revision,configuration,actor_ref,request_key,saved_at)
    values(p_clinic_id,p_expected_revision+1,p_configuration,v_actor,p_request_key,v_now);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
    values(p_clinic_id,v_actor,'AgendaConfigurationSaved',p_clinic_id,p_request_key,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
    values(p_clinic_id,'AgendaConfigurationSaved',1,'agenda_configuration',p_clinic_id,p_request_key,v_actor,v_now,
      jsonb_build_object('revision',p_expected_revision+1));
  return jsonb_build_object('settings',p_configuration,'replayed',false);
end $$;
revoke all on function public.read_local_agenda_configuration(uuid,text) from public,anon,authenticated;
revoke all on function public.save_local_agenda_configuration(uuid,integer,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.read_local_agenda_configuration(uuid,text) to authenticated;
grant execute on function public.save_local_agenda_configuration(uuid,integer,jsonb,uuid,text) to authenticated;

-- Manager-only preview of public-bookable types using the scheduling kernel.
-- All arrays come from one SQL snapshot; no patient identity or hold actor is read.
-- This does not unify the older demo-confirmation lane or enable public booking.
create function private.agenda_availability_snapshot(p_clinic_id uuid,p_date date)
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
      from private.scheduling_occupancy o join private.scheduling_holds h on h.clinic_id=o.clinic_id and h.id=o.hold_id
      where o.clinic_id=p_clinic_id and o.active and h.status='held' and h.expires_at>v_now
        and o.period && tstzrange(v_from,v_to,'[)')),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function private.agenda_availability_snapshot(uuid,date) from public,anon,authenticated;

create function public.read_local_agenda_availability_snapshot(p_clinic_id uuid,p_date date,p_gate_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.authorize_agenda_configuration(p_clinic_id,p_gate_key);
  return private.agenda_availability_snapshot(p_clinic_id,p_date);
end $$;
revoke all on function public.read_local_agenda_availability_snapshot(uuid,date,text) from public,anon,authenticated;
grant execute on function public.read_local_agenda_availability_snapshot(uuid,date,text) to authenticated;

-- Only the local API holds this separate discovery capability. The API resolves
-- the clinic server-side and projects a public DTO; this RPC is not a browser API.
create function public.read_local_public_agenda_snapshot(p_clinic_id uuid,p_date date,p_gate_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from private.agenda_configuration_gates where clinic_id=p_clinic_id
    and enabled and synthetic_only and public_discovery_enabled
    and public_api_gate_key<>'' and public_api_gate_key=p_gate_key) then
    raise exception using errcode='PT503',message='local_public_discovery_disabled';
  end if;
  return private.agenda_availability_snapshot(p_clinic_id,p_date);
end $$;
revoke all on function public.read_local_public_agenda_snapshot(uuid,date,text) from public,anon,authenticated;
grant execute on function public.read_local_public_agenda_snapshot(uuid,date,text) to anon;
