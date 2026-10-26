-- Synthetic scheduling kernel only. All commands/read projections default off.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create table private.scheduling_settings (
  clinic_id uuid primary key references public.clinics(id),
  enabled boolean not null default false,
  synthetic_only boolean not null default true check(synthetic_only),
  hold_ttl_seconds integer not null default 300 check(hold_ttl_seconds between 1 and 900),
  max_hold_seconds integer not null default 7200 check(max_hold_seconds between 1 and 86400),
  horizon_seconds integer not null default 2592000 check(horizon_seconds between 1 and 31536000),
  max_search_seconds integer not null default 604800 check(max_search_seconds between 1 and 2678400)
);
create table private.scheduling_resources (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  kind text not null check(kind in ('provider','chair')),
  display_name text not null check(char_length(btrim(display_name)) between 1 and 120),
  active boolean not null default true,
  synthetic_only boolean not null default true check(synthetic_only),
  unique(clinic_id,id)
);
create table private.scheduling_windows (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  resource_id uuid not null,
  starts_at timestamptz not null,ends_at timestamptz not null,
  foreign key(clinic_id,resource_id) references private.scheduling_resources(clinic_id,id),
  check(starts_at<ends_at),
  check(starts_at=date_trunc('milliseconds',starts_at) and ends_at=date_trunc('milliseconds',ends_at))
);
create index scheduling_windows_resource on private.scheduling_windows(clinic_id,resource_id,starts_at);
create table private.scheduling_holds (
  id uuid primary key default gen_random_uuid(),clinic_id uuid not null references public.clinics(id),
  actor_ref uuid not null,provider_resource_id uuid not null,chair_resource_id uuid not null,
  starts_at timestamptz not null,ends_at timestamptz not null,display_timezone text not null,
  expires_at timestamptz not null,created_at timestamptz not null,
  status text not null default 'held' check(status in ('held','released','expired')),
  version integer not null default 1 check(version>0),
  foreign key(clinic_id,provider_resource_id) references private.scheduling_resources(clinic_id,id),
  foreign key(clinic_id,chair_resource_id) references private.scheduling_resources(clinic_id,id),
  unique(clinic_id,id),check(starts_at<ends_at),check(provider_resource_id<>chair_resource_id)
);
create index scheduling_holds_expiry on private.scheduling_holds(clinic_id,expires_at) where status='held';
create table private.scheduling_occupancy (
  clinic_id uuid not null,hold_id uuid not null,resource_id uuid not null,
  period tstzrange not null,active boolean not null default true,
  primary key(hold_id,resource_id),
  foreign key(clinic_id,hold_id) references private.scheduling_holds(clinic_id,id),
  foreign key(clinic_id,resource_id) references private.scheduling_resources(clinic_id,id),
  check(not isempty(period) and lower_inc(period) and not upper_inc(period) and not lower_inf(period) and not upper_inf(period)),
  exclude using gist(clinic_id extensions.gist_uuid_ops with =,resource_id extensions.gist_uuid_ops with =,period with &&) where(active)
);
create table private.scheduling_idempotency (
  clinic_id uuid not null references public.clinics(id),actor_ref uuid not null,
  command text not null check(command in ('create_hold','release_hold')),request_key uuid not null,
  canonical_payload jsonb not null,receipt jsonb not null,created_at timestamptz not null,
  primary key(clinic_id,actor_ref,command,request_key)
);
alter table private.outbox_events add column aggregate_type text,add column payload jsonb;
alter table private.scheduling_settings enable row level security;
alter table private.scheduling_resources enable row level security;
alter table private.scheduling_windows enable row level security;
alter table private.scheduling_holds enable row level security;
alter table private.scheduling_occupancy enable row level security;
alter table private.scheduling_idempotency enable row level security;
revoke all on private.scheduling_settings,private.scheduling_resources,private.scheduling_windows,private.scheduling_holds,private.scheduling_occupancy,private.scheduling_idempotency from public,anon,authenticated;

create function private.scheduling_time(p_time timestamptz) returns text language sql immutable set search_path='' as $$
  select to_char(p_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;
create function private.require_scheduling(p_clinic uuid) returns uuid language plpgsql set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception using errcode='28000',message='unauthenticated';end if;
  if p_clinic is null or not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic and user_id=v_actor and active and role in ('reception','manager','dentist')) then raise exception using errcode='42501',message='forbidden';end if;
  if not exists(select 1 from private.scheduling_settings where clinic_id=p_clinic and enabled and synthetic_only) then raise exception using errcode='PT503',message='scheduling_disabled';end if;
  if coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='invalid_request';end if;
  return v_actor;
end $$;
create function private.scheduling_normalize(p_body jsonb,p_window boolean default false) returns jsonb language plpgsql set search_path='' set timezone='UTC' as $$
declare v_start_key text:=case when p_window then 'window_starts_at' else 'starts_at' end;
  v_end_key text:=case when p_window then 'window_ends_at' else 'ends_at' end;
  v_start timestamptz;v_end timestamptz;v_provider uuid;v_chair uuid;v_zone text;v_time text;
begin
  if p_body is null or jsonb_typeof(p_body)<>'object' then raise exception using errcode='22023',message='invalid_request';end if;
  if not(p_body ?& array['provider_resource_id','chair_resource_id',v_start_key,v_end_key,'display_timezone']) or (select count(*) from jsonb_object_keys(p_body))<>5 then raise exception using errcode='22023',message='invalid_request';end if;
  if exists(select 1 from jsonb_each(p_body) where jsonb_typeof(value)<>'string') then raise exception using errcode='22023',message='invalid_request';end if;
  if (p_body->>'provider_resource_id') !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
    or (p_body->>'chair_resource_id') !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
  then raise exception using errcode='22023',message='invalid_request';end if;
  begin v_provider:=(p_body->>'provider_resource_id')::uuid;v_chair:=(p_body->>'chair_resource_id')::uuid;
  exception when others then raise exception using errcode='22023',message='invalid_request';end;
  foreach v_time in array array[p_body->>v_start_key,p_body->>v_end_key] loop
    if v_time !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$' then raise exception using errcode='22023',message='invalid_request';end if;
  end loop;
  begin v_start:=(p_body->>v_start_key)::timestamptz;v_end:=(p_body->>v_end_key)::timestamptz;
  exception when others then raise exception using errcode='22023',message='invalid_request';end;
  v_zone:=btrim(p_body->>'display_timezone',E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
  if v_start>=v_end or extract(year from v_start) not between 1 and 9999 or extract(year from v_end) not between 1 and 9999 or char_length(v_zone) not between 1 and 64
    or not exists(select 1 from pg_timezone_names where lower(name)=lower(v_zone) and name !~ '^(posix|right)/') then raise exception using errcode='22023',message='invalid_request';end if;
  return jsonb_build_object('provider_resource_id',v_provider,'chair_resource_id',v_chair,v_start_key,private.scheduling_time(v_start),v_end_key,private.scheduling_time(v_end),'display_timezone',v_zone);
end $$;
create function private.scheduling_validate_pair(p_clinic uuid,p_provider uuid,p_chair uuid) returns void language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from private.scheduling_resources where clinic_id=p_clinic and id=p_provider and kind='provider' and active and synthetic_only)
    or not exists(select 1 from private.scheduling_resources where clinic_id=p_clinic and id=p_chair and kind='chair' and active and synthetic_only)
  then raise exception using errcode='SH404',message='resource_not_found';end if;
end $$;
create function private.scheduling_hold_item(p_hold private.scheduling_holds,p_now timestamptz) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p_hold.id,'clinic_id',p_hold.clinic_id,'provider_resource_id',p_hold.provider_resource_id,'chair_resource_id',p_hold.chair_resource_id,
 'starts_at',private.scheduling_time(p_hold.starts_at),'ends_at',private.scheduling_time(p_hold.ends_at),'display_timezone',p_hold.display_timezone,
 'status',case when p_hold.status='held' and p_hold.expires_at<=p_now then 'expired' else p_hold.status end,
 'expires_at',private.scheduling_time(p_hold.expires_at),'created_at',private.scheduling_time(p_hold.created_at),'version',p_hold.version)
$$;
create function private.scheduling_emit(p_hold private.scheduling_holds,p_event text,p_actor uuid,p_correlation uuid,p_now timestamptz) returns void language plpgsql set search_path='' as $$
begin
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at) values(p_hold.clinic_id,p_actor,p_event,p_hold.id,p_correlation,p_now);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
 values(p_hold.clinic_id,p_event,1,'scheduling_hold',p_hold.id,p_correlation,p_actor,p_now,
 jsonb_build_object('provider_resource_id',p_hold.provider_resource_id,'chair_resource_id',p_hold.chair_resource_id,'starts_at',private.scheduling_time(p_hold.starts_at),'ends_at',private.scheduling_time(p_hold.ends_at),'expires_at',private.scheduling_time(p_hold.expires_at),'status',p_hold.status));
end $$;
create function private.scheduling_expire(p_clinic uuid,p_now timestamptz,p_correlation uuid) returns void language plpgsql set search_path='' as $$
declare v_hold private.scheduling_holds;
-- Stable nonhuman principal. Not a staff auth account; callers cannot choose it.
  v_system constant uuid:='00000000-0000-4000-8000-000000000001';
begin
 for v_hold in update private.scheduling_holds set status='expired',version=version+1 where clinic_id=p_clinic and status='held' and expires_at<=p_now returning * loop
   update private.scheduling_occupancy set active=false where clinic_id=p_clinic and hold_id=v_hold.id;
   perform private.scheduling_emit(v_hold,'SlotHoldExpired',v_system,p_correlation,p_now);
 end loop;
end $$;

create function public.scheduling_resources(p_clinic_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_now timestamptz;v_items jsonb;v_count integer;
begin
 perform private.require_scheduling(p_clinic_id);v_now:=date_trunc('milliseconds',clock_timestamp());
 with limited as(select id,kind,display_name from private.scheduling_resources where clinic_id=p_clinic_id and active and synthetic_only order by kind,id limit 101),numbered as(select *,row_number()over(order by kind,id) n from limited)
 select coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by kind,id) filter(where n<=100),'[]'::jsonb),count(*) into v_items,v_count from numbered;
 return jsonb_build_object('items',v_items,'observed_at',private.scheduling_time(v_now),'truncated',v_count>100);
end $$;
create function public.scheduling_availability(p_clinic_id uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
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
 select coalesce(range_agg(o.period),'{}'::tstzmultirange) into v_busy from private.scheduling_occupancy o join private.scheduling_holds h on h.id=o.hold_id and h.clinic_id=o.clinic_id
 where o.clinic_id=p_clinic_id and o.resource_id in(v_provider,v_chair) and o.active and h.status='held' and h.expires_at>v_now;
 v_free:=(v_providers*v_chairs*tstzmultirange(tstzrange(v_start,v_end,'[)')))-v_busy;
 with limited as(select r from unnest(v_free) r order by lower(r) limit 201),numbered as(select r,row_number()over(order by lower(r)) n from limited)
 select coalesce(jsonb_agg(jsonb_build_object('starts_at',private.scheduling_time(lower(r)),'ends_at',private.scheduling_time(upper(r))) order by lower(r)) filter(where n<=200),'[]'::jsonb),count(*) into v_items,v_count from numbered;
 return v_body||jsonb_build_object('observed_at',private.scheduling_time(v_now),'informational',true,'intervals',v_items,'truncated',v_count>200);
end $$;
create function public.scheduling_create_hold(p_clinic_id uuid,p_request_key uuid,p_request jsonb,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_now timestamptz;v_body jsonb;v_prior private.scheduling_idempotency;v_config private.scheduling_settings;v_hold private.scheduling_holds;
 v_provider uuid;v_chair uuid;v_start timestamptz;v_end timestamptz;v_windows tstzmultirange;v_receipt jsonb;
begin
 v_actor:=private.require_scheduling(p_clinic_id);
 perform pg_advisory_xact_lock(hashtextextended('scheduling:'||p_clinic_id::text,0));
 perform private.require_scheduling(p_clinic_id);v_now:=date_trunc('milliseconds',clock_timestamp());
 if p_request_key is null or p_correlation_id is null then raise exception using errcode='22023',message='invalid_request';end if;
 v_body:=private.scheduling_normalize(p_request);
 select * into v_prior from private.scheduling_idempotency where clinic_id=p_clinic_id and actor_ref=v_actor and command='create_hold' and request_key=p_request_key;
 if found then
   if v_prior.canonical_payload<>v_body then raise exception using errcode='SH410',message='idempotency_conflict';end if;
   return v_prior.receipt||jsonb_build_object('replayed',true);
 end if;
 perform private.scheduling_expire(p_clinic_id,v_now,p_correlation_id);
 v_provider:=(v_body->>'provider_resource_id')::uuid;v_chair:=(v_body->>'chair_resource_id')::uuid;v_start:=(v_body->>'starts_at')::timestamptz;v_end:=(v_body->>'ends_at')::timestamptz;
 select * into strict v_config from private.scheduling_settings where clinic_id=p_clinic_id;
 if v_start<v_now or v_end>v_now+v_config.horizon_seconds*interval '1 second' or v_end-v_start>v_config.max_hold_seconds*interval '1 second' then raise exception using errcode='22023',message='invalid_request';end if;
 perform private.scheduling_validate_pair(p_clinic_id,v_provider,v_chair);
 foreach v_provider in array array[v_provider,v_chair] loop
   select coalesce(range_agg(tstzrange(starts_at,ends_at,'[)')),'{}'::tstzmultirange) into v_windows from private.scheduling_windows where clinic_id=p_clinic_id and resource_id=v_provider;
   if not(v_windows @> tstzrange(v_start,v_end,'[)')) then raise exception using errcode='SH409',message='resource_conflict';end if;
 end loop;
 insert into private.scheduling_holds(clinic_id,actor_ref,provider_resource_id,chair_resource_id,starts_at,ends_at,display_timezone,expires_at,created_at)
 values(p_clinic_id,v_actor,(v_body->>'provider_resource_id')::uuid,v_chair,v_start,v_end,v_body->>'display_timezone',v_now+v_config.hold_ttl_seconds*interval '1 second',v_now) returning * into v_hold;
 insert into private.scheduling_occupancy(clinic_id,hold_id,resource_id,period) values
 (p_clinic_id,v_hold.id,v_hold.provider_resource_id,tstzrange(v_start,v_end,'[)')),(p_clinic_id,v_hold.id,v_hold.chair_resource_id,tstzrange(v_start,v_end,'[)'));
 perform private.scheduling_emit(v_hold,'SlotHoldCreated',v_actor,p_correlation_id,v_now);
 v_receipt:=jsonb_build_object('item',private.scheduling_hold_item(v_hold,v_now),'replayed',false,'observed_at',private.scheduling_time(v_now));
 insert into private.scheduling_idempotency values(p_clinic_id,v_actor,'create_hold',p_request_key,v_body,v_receipt,v_now);
 return v_receipt;
exception when exclusion_violation then raise exception using errcode='SH409',message='resource_conflict';
end $$;
create function public.scheduling_get_hold(p_clinic_id uuid,p_hold_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_hold private.scheduling_holds;v_now timestamptz;
begin
 perform private.require_scheduling(p_clinic_id);v_now:=date_trunc('milliseconds',clock_timestamp());
 select * into v_hold from private.scheduling_holds where clinic_id=p_clinic_id and id=p_hold_id;
 if not found then raise exception using errcode='SH405',message='hold_not_found';end if;
 return jsonb_build_object('item',private.scheduling_hold_item(v_hold,v_now),'observed_at',private.scheduling_time(v_now));
end $$;
create function public.scheduling_release_hold(p_clinic_id uuid,p_hold_id uuid,p_request_key uuid,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_now timestamptz;v_hold private.scheduling_holds;v_body jsonb;v_prior private.scheduling_idempotency;v_receipt jsonb;v_transitioned boolean:=false;
begin
 v_actor:=private.require_scheduling(p_clinic_id);
 perform pg_advisory_xact_lock(hashtextextended('scheduling:'||p_clinic_id::text,0));
 perform private.require_scheduling(p_clinic_id);v_now:=date_trunc('milliseconds',clock_timestamp());
 if p_hold_id is null or p_request_key is null or p_correlation_id is null then raise exception using errcode='22023',message='invalid_request';end if;
 v_body:=jsonb_build_object('hold_id',p_hold_id);
 select * into v_prior from private.scheduling_idempotency where clinic_id=p_clinic_id and actor_ref=v_actor and command='release_hold' and request_key=p_request_key;
 if found then
   if v_prior.canonical_payload<>v_body then raise exception using errcode='SH410',message='idempotency_conflict';end if;
   return v_prior.receipt||jsonb_build_object('replayed',true);
 end if;
 select * into v_hold from private.scheduling_holds where clinic_id=p_clinic_id and id=p_hold_id for update;
 if not found then raise exception using errcode='SH405',message='hold_not_found';end if;
 if v_hold.status='expired' or (v_hold.status='held' and v_hold.expires_at<=v_now) then raise exception using errcode='SH411',message='hold_expired';end if;
 if v_hold.status='held' then
   update private.scheduling_holds set status='released',version=version+1 where id=v_hold.id returning * into v_hold;
   update private.scheduling_occupancy set active=false where clinic_id=p_clinic_id and hold_id=p_hold_id;
   perform private.scheduling_emit(v_hold,'SlotHoldReleased',v_actor,p_correlation_id,v_now);v_transitioned:=true;
 end if;
 v_receipt:=jsonb_build_object('item',private.scheduling_hold_item(v_hold,v_now),'replayed',false,'transitioned',v_transitioned,'observed_at',private.scheduling_time(v_now));
 insert into private.scheduling_idempotency values(p_clinic_id,v_actor,'release_hold',p_request_key,v_body,v_receipt,v_now);
 return v_receipt;
end $$;

revoke all on function private.scheduling_time(timestamptz),private.require_scheduling(uuid),private.scheduling_normalize(jsonb,boolean),private.scheduling_validate_pair(uuid,uuid,uuid),private.scheduling_hold_item(private.scheduling_holds,timestamptz),private.scheduling_emit(private.scheduling_holds,text,uuid,uuid,timestamptz),private.scheduling_expire(uuid,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.scheduling_resources(uuid),public.scheduling_availability(uuid,jsonb),public.scheduling_create_hold(uuid,uuid,jsonb,uuid),public.scheduling_get_hold(uuid,uuid),public.scheduling_release_hold(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.scheduling_resources(uuid),public.scheduling_availability(uuid,jsonb),public.scheduling_create_hold(uuid,uuid,jsonb,uuid),public.scheduling_get_hold(uuid,uuid),public.scheduling_release_hold(uuid,uuid,uuid,uuid) to authenticated;

-- Isolated development-only fixture clinic. No accounts, qualifications or real hours.
insert into public.clinics(id,name) values('71000000-0000-4000-8000-000000000001','Synthetic scheduling sandbox');
insert into private.scheduling_settings(clinic_id) values('71000000-0000-4000-8000-000000000001');
insert into private.scheduling_resources(id,clinic_id,kind,display_name) values
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','provider','Synthetic provider A'),
 ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','provider','Synthetic provider B'),
 ('72000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000001','chair','Synthetic chair A'),
 ('72000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000001','chair','Synthetic chair B');
insert into private.scheduling_windows(clinic_id,resource_id,starts_at,ends_at) select clinic_id,id,'2020-01-01Z'::timestamptz,'2100-01-01Z'::timestamptz from private.scheduling_resources where clinic_id='71000000-0000-4000-8000-000000000001';
