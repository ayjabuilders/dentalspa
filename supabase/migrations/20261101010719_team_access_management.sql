-- Local-only manager-controlled team provisioning and access changes.
-- No invitation or email is sent. Auth passwords are never stored by this schema.
create table private.local_team_access_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  api_gate_key text not null default '' check (length(api_gate_key)<=200)
);
insert into private.local_team_access_settings(singleton,enabled,api_gate_key) values(true,false,'');

create table private.local_team_provisioning_reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  actor_id uuid not null references auth.users(id),
  request_key uuid not null,
  email_normalized text not null check(length(email_normalized) between 3 and 254),
  request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
  display_name text not null check(length(display_name) between 1 and 120),
  roles text[] not null check(cardinality(roles) between 1 and 4 and roles <@ array['dentist','reception','assistant','manager']::text[]),
  auth_user_id uuid unique references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(clinic_id,actor_id,request_key)
);
create unique index local_team_reservation_email_global on private.local_team_provisioning_reservations(email_normalized);
create table private.team_access_member_state (
  clinic_id uuid not null references public.clinics(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  roles text[] not null check(cardinality(roles) between 1 and 4 and roles <@ array['dentist','reception','assistant','manager']::text[]),
  active boolean not null default true,
  version integer not null default 1 check(version > 0),
  updated_at timestamptz not null default now(),
  primary key(clinic_id,user_id)
);
create table private.team_access_command_receipts (
  clinic_id uuid not null references public.clinics(id),
  actor_id uuid not null references auth.users(id),
  request_key uuid not null,
  request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
  target_user_id uuid not null references auth.users(id),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(clinic_id,actor_id,request_key)
);
alter table private.local_team_access_settings enable row level security;
alter table private.local_team_provisioning_reservations enable row level security;
alter table private.team_access_member_state enable row level security;
alter table private.team_access_command_receipts enable row level security;
revoke all on private.local_team_access_settings,private.local_team_provisioning_reservations,private.team_access_member_state,private.team_access_command_receipts from public,anon,authenticated,service_role;

create function private.local_team_access_authorized(p_gate text,p_clinic_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select x.enabled and x.api_gate_key<>'' and x.api_gate_key=p_gate from private.local_team_access_settings x where x.singleton)
  and exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>now()))
  and exists(select 1 from public.clinic_memberships m where m.clinic_id=p_clinic_id and m.user_id=auth.uid() and m.active and m.role='manager'),false)
$$;
revoke all on function private.local_team_access_authorized(text,uuid) from public,anon,authenticated,service_role;

create function public.list_team_access_members(p_clinic_id uuid,p_query text,p_cursor text,p_gate text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;v_next text;v_count integer;v_cut timestamptz;v_cut_id uuid;v_q text:=nullif(btrim(p_query),'');
begin
 if not private.local_team_access_authorized(p_gate,p_clinic_id) then raise exception using errcode='42501',message='Team access denied';end if;
 if coalesce(current_setting('request.method',true),'')<>'POST' or p_query is not null and (length(p_query)>100 or btrim(p_query)<>p_query) then raise exception using errcode='22023',message='Invalid team access query';end if;
 if p_cursor is not null then
   if p_cursor !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\|[0-9a-fA-F-]{36}$' then raise exception using errcode='22023',message='Invalid team access cursor';end if;
   v_cut:=split_part(p_cursor,'|',1)::timestamptz;v_cut_id:=split_part(p_cursor,'|',2)::uuid;
 end if;
 with members as (
  select m.user_id,coalesce(p.display_name,u.email) display_name,u.email,
    coalesce(s.roles,array_agg(distinct m.role collate "C" order by m.role collate "C")) roles,
    coalesce(s.active,bool_or(m.active)) active,coalesce(s.version,1) version,
    min(m.created_at) created_at
  from public.clinic_memberships m
  join auth.users u on u.id=m.user_id
  left join public.profiles p on p.user_id=m.user_id
  left join private.team_access_member_state s on s.clinic_id=m.clinic_id and s.user_id=m.user_id
  where m.clinic_id=p_clinic_id
  group by m.user_id,p.display_name,u.email,s.roles,s.active,s.version
 ),filtered as (
  select * from members x where (v_q is null or position(lower(v_q) in lower(x.display_name||' '||x.email))>0)
   and (v_cut is null or (x.created_at,x.user_id)>(v_cut,v_cut_id))
 ),page as (
  select * from filtered order by created_at,user_id limit 11
 ),numbered as (
  select *,row_number() over(order by created_at,user_id) n from page
 )
 select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'display_name',display_name,'email',email,'roles',roles,'active',active,'version',version,'created_at',created_at) order by n) filter(where n<=10),'[]'::jsonb),
   (select count(*) from numbered),
   (select to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')||'|'||user_id::text from numbered where n=10)
 into v_rows,v_count,v_next from numbered;
 return jsonb_build_object('schema_version',1,'clinic_id',p_clinic_id,'current_user_id',auth.uid(),'items',v_rows,'next_cursor',case when v_count>10 then v_next else null end,
 'clinical_role_notice','Clinical roles grant application access only; they do not verify professional qualifications.');
end $$;
revoke all on function public.list_team_access_members(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.list_team_access_members(uuid,text,text,text) to authenticated;

-- Reserves an email globally before Auth Admin is called. Any Auth account that
-- exists without this reservation is rejected and never attached to a clinic.
create function public.reserve_local_team_member(p_clinic_id uuid,p_email text,p_fingerprint text,p_display_name text,p_roles text[],p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_row private.local_team_provisioning_reservations%rowtype;v_email text:=lower(btrim(p_email));
begin
 if not private.local_team_access_authorized(p_gate,p_clinic_id) then raise exception using errcode='42501',message='Team access denied';end if;
 if coalesce(current_setting('request.method',true),'')<>'POST' or v_actor is null or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email)>254 or p_fingerprint !~ '^[0-9a-f]{64}$' or length(btrim(p_display_name)) not between 1 and 120 or cardinality(p_roles) not between 1 and 4 or not (p_roles <@ array['dentist','reception','assistant','manager']::text[]) or cardinality(array(select distinct unnest(p_roles)))<>cardinality(p_roles) then raise exception using errcode='22023',message='Invalid team member';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_email,0));
 if not private.local_team_access_authorized(p_gate,p_clinic_id) then raise exception using errcode='42501',message='Team access denied';end if;
 select * into v_row from private.local_team_provisioning_reservations r where r.clinic_id=p_clinic_id and r.actor_id=v_actor and r.request_key=p_request_key for update;
 if found then
   if v_row.request_fingerprint<>p_fingerprint then raise exception using errcode='23505',message='Idempotency key conflict';end if;
   return jsonb_build_object('reservation_id',v_row.reservation_id,'auth_user_id',v_row.auth_user_id,'completed',v_row.completed_at is not null,'replayed',true);
 end if;
 if exists(select 1 from private.local_team_provisioning_reservations r where r.email_normalized=v_email) then raise exception using errcode='23505',message='Email is reserved';end if;
 insert into private.local_team_provisioning_reservations(clinic_id,actor_id,request_key,email_normalized,request_fingerprint,display_name,roles)
 values(p_clinic_id,v_actor,p_request_key,v_email,p_fingerprint,btrim(p_display_name),p_roles) returning * into v_row;
 return jsonb_build_object('reservation_id',v_row.reservation_id,'auth_user_id',null,'completed',false,'replayed',false);
end $$;
revoke all on function public.reserve_local_team_member(uuid,text,text,text,text[],uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_local_team_member(uuid,text,text,text,text[],uuid,text) to authenticated;

-- Release only a reservation proven to belong to a different, pre-existing
-- Auth account. Unknown Auth outcomes keep the reservation for safe retry.
create function public.release_foreign_local_team_member_reservation(p_clinic_id uuid,p_reservation_id uuid,p_request_key uuid,p_gate text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_email text;v_res private.local_team_provisioning_reservations%rowtype;
begin
 if not private.local_team_access_authorized(p_gate,p_clinic_id) then raise exception using errcode='42501',message='Team access denied';end if;
 if coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid team reservation release';end if;
 select * into v_res from private.local_team_provisioning_reservations r where r.reservation_id=p_reservation_id and r.clinic_id=p_clinic_id and r.actor_id=v_actor and r.request_key=p_request_key for update;
 if not found then return false;end if;
 if not private.local_team_access_authorized(p_gate,p_clinic_id) then raise exception using errcode='42501',message='Team access denied';end if;
 if v_res.completed_at is not null or exists(select 1 from auth.users u where lower(u.email)=v_res.email_normalized and u.raw_app_meta_data->>'local_team_provisioning_id'=v_res.reservation_id::text) then raise exception using errcode='42501',message='Team reservation cannot be released';end if;
 delete from private.local_team_provisioning_reservations where reservation_id=v_res.reservation_id;
 return true;
end $$;
revoke all on function public.release_foreign_local_team_member_reservation(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.release_foreign_local_team_member_reservation(uuid,uuid,uuid,text) to authenticated;

create function public.finalize_local_team_member(p_clinic_id uuid,p_reservation_id uuid,p_auth_user_id uuid,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_res private.local_team_provisioning_reservations%rowtype;v_response jsonb;v_member jsonb;
begin
 if not private.local_team_access_authorized(p_gate,p_clinic_id) then raise exception using errcode='42501',message='Team access denied';end if;
 if coalesce(current_setting('request.method',true),'')<>'POST' or v_actor is null then raise exception using errcode='22023',message='Invalid team member finalization';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text||':team-access',0));
 if not private.local_team_access_authorized(p_gate,p_clinic_id) then raise exception using errcode='42501',message='Team access denied';end if;
 select * into v_res from private.local_team_provisioning_reservations r where r.reservation_id=p_reservation_id and r.clinic_id=p_clinic_id and r.actor_id=v_actor and r.request_key=p_request_key for update;
 if not found then raise exception using errcode='42501',message='Team access denied';end if;
 if v_res.completed_at is not null then
  select response into v_response from private.team_access_command_receipts where clinic_id=p_clinic_id and actor_id=v_actor and request_key=p_request_key;
  if v_response is null then raise exception using errcode='PT503',message='Team receipt unavailable';end if;
  return jsonb_build_object('receipt',v_response,'replayed',true);
 end if;
 if p_auth_user_id is null or not exists(select 1 from auth.users u where u.id=p_auth_user_id and lower(u.email)=v_res.email_normalized and u.raw_app_meta_data->>'local_team_provisioning_id'=v_res.reservation_id::text) then raise exception using errcode='42501',message='Team access denied';end if;
 if exists(select 1 from public.clinic_memberships m where m.user_id=p_auth_user_id) then raise exception using errcode='23505',message='Auth account already has memberships';end if;
 insert into public.profiles(user_id,display_name) values(p_auth_user_id,v_res.display_name);
 insert into public.clinic_memberships(clinic_id,user_id,role,active) select p_clinic_id,p_auth_user_id,r,true from unnest(v_res.roles) r;
 insert into private.team_access_member_state(clinic_id,user_id,roles,active,version) values(p_clinic_id,p_auth_user_id,v_res.roles,true,1);
 select jsonb_build_object('user_id',p_auth_user_id,'display_name',v_res.display_name,'email',v_res.email_normalized,'roles',to_jsonb(v_res.roles),'active',true,'version',1,'created_at',min(m.created_at)) into v_member from public.clinic_memberships m where m.clinic_id=p_clinic_id and m.user_id=p_auth_user_id;
 v_response:=jsonb_build_object('clinic_id',p_clinic_id,'member',v_member,'replayed',false,'clinical_role_notice','Clinical roles grant application access only; they do not verify professional qualifications.');
 insert into private.team_access_command_receipts(clinic_id,actor_id,request_key,request_fingerprint,target_user_id,response) values(p_clinic_id,v_actor,p_request_key,v_res.request_fingerprint,p_auth_user_id,v_response);
 update private.local_team_provisioning_reservations set auth_user_id=p_auth_user_id,completed_at=now() where reservation_id=p_reservation_id;
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'team.member.created',p_auth_user_id,p_request_key);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'TeamMemberCreated',1,'team_member',p_auth_user_id,p_request_key,v_actor,jsonb_build_object('roles',to_jsonb(v_res.roles)));
 return jsonb_build_object('receipt',v_response,'replayed',false);
end $$;
revoke all on function public.finalize_local_team_member(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_local_team_member(uuid,uuid,uuid,uuid,text) to authenticated;

create function public.update_team_access_member(p_clinic_id uuid,p_target_user_id uuid,p_expected_version integer,p_roles text[],p_active boolean,p_request_key uuid,p_fingerprint text,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_state private.team_access_member_state%rowtype;v_version integer;v_roles text[];v_active boolean;v_member jsonb;v_receipt jsonb;v_existing private.team_access_command_receipts%rowtype;v_other_managers integer;
begin
 if not private.local_team_access_authorized(p_gate,p_clinic_id) then raise exception using errcode='42501',message='Team access denied';end if;
 if coalesce(current_setting('request.method',true),'')<>'POST' or v_actor is null or p_target_user_id is null or p_target_user_id=v_actor or p_expected_version<1 or p_roles is null or cardinality(p_roles) not between 1 and 4 or not (p_roles <@ array['dentist','reception','assistant','manager']::text[]) or cardinality(array(select distinct unnest(p_roles)))<>cardinality(p_roles) or p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Invalid team access update';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text||':team-access',0));
 if not private.local_team_access_authorized(p_gate,p_clinic_id) then raise exception using errcode='42501',message='Team access denied';end if;
 select * into v_existing from private.team_access_command_receipts r where r.clinic_id=p_clinic_id and r.actor_id=v_actor and r.request_key=p_request_key;
 if found then
  if v_existing.request_fingerprint<>p_fingerprint or v_existing.target_user_id<>p_target_user_id then raise exception using errcode='23505',message='Idempotency key conflict';end if;
  return jsonb_build_object('receipt',v_existing.response,'replayed',true);
 end if;
 if not exists(select 1 from public.clinic_memberships m where m.clinic_id=p_clinic_id and m.user_id=p_target_user_id) then raise exception using errcode='P0002',message='Team member unavailable';end if;
 insert into private.team_access_member_state(clinic_id,user_id,roles,active,version)
 select p_clinic_id,p_target_user_id,array_agg(distinct role collate "C" order by role collate "C"),bool_or(active),1
 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=p_target_user_id
 on conflict(clinic_id,user_id) do nothing;
 select * into v_state from private.team_access_member_state s where s.clinic_id=p_clinic_id and s.user_id=p_target_user_id for update;
 if v_state.version<>p_expected_version then raise exception using errcode='40001',message='Team member version conflict';end if;
 if v_state.active and 'manager'=any(v_state.roles) and (not p_active or not ('manager'=any(p_roles))) then
   select count(distinct user_id) into v_other_managers from public.clinic_memberships m where m.clinic_id=p_clinic_id and m.user_id<>p_target_user_id and m.active and m.role='manager';
   if v_other_managers=0 then raise exception using errcode='23514',message='Cannot remove the last active manager';end if;
 end if;
 update public.clinic_memberships set active=(p_active and role=any(p_roles)) where clinic_id=p_clinic_id and user_id=p_target_user_id;
 insert into public.clinic_memberships(clinic_id,user_id,role,active)
 select p_clinic_id,p_target_user_id,r,p_active from unnest(p_roles) r
 on conflict(clinic_id,user_id,role) do update set active=excluded.active;
 update private.team_access_member_state set roles=p_roles,active=p_active,version=version+1,updated_at=now() where clinic_id=p_clinic_id and user_id=p_target_user_id returning version into v_version;
 select jsonb_build_object('user_id',u.id,'display_name',coalesce(p.display_name,u.email),'email',u.email,'roles',to_jsonb(p_roles),'active',p_active,'version',v_version,'created_at',(select min(m.created_at) from public.clinic_memberships m where m.clinic_id=p_clinic_id and m.user_id=u.id)) into v_member
 from auth.users u left join public.profiles p on p.user_id=u.id where u.id=p_target_user_id;
 v_receipt:=jsonb_build_object('clinic_id',p_clinic_id,'member',v_member,'replayed',false,'clinical_role_notice','Clinical roles grant application access only; they do not verify professional qualifications.');
 insert into private.team_access_command_receipts(clinic_id,actor_id,request_key,request_fingerprint,target_user_id,response) values(p_clinic_id,v_actor,p_request_key,p_fingerprint,p_target_user_id,v_receipt);
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'team.member.access_updated',p_target_user_id,p_request_key);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'TeamMemberAccessUpdated',1,'team_member',p_target_user_id,p_request_key,v_actor,jsonb_build_object('roles',to_jsonb(p_roles),'active',p_active,'version',v_version));
 return jsonb_build_object('receipt',v_receipt,'replayed',false);
end $$;
revoke all on function public.update_team_access_member(uuid,uuid,integer,text[],boolean,uuid,text,text) from public,anon,authenticated;
grant execute on function public.update_team_access_member(uuid,uuid,integer,text[],boolean,uuid,text,text) to authenticated;
