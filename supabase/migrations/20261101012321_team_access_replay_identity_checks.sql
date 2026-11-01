-- Bind safe command replay to the original identity and immutable account inputs.
create or replace function public.reserve_local_team_member(p_clinic_id uuid,p_email text,p_fingerprint text,p_display_name text,p_roles text[],p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_row private.local_team_provisioning_reservations%rowtype;v_email text:=lower(btrim(p_email));
begin
 if not private.local_team_access_authorized(p_gate,p_clinic_id) then raise exception using errcode='42501',message='Team access denied';end if;
 if coalesce(current_setting('request.method',true),'')<>'POST' or v_actor is null or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email)>254 or p_fingerprint !~ '^[0-9a-f]{64}$' or length(btrim(p_display_name)) not between 1 and 120 or cardinality(p_roles) not between 1 and 4 or not (p_roles <@ array['dentist','reception','assistant','manager']::text[]) or cardinality(array(select distinct unnest(p_roles)))<>cardinality(p_roles) then raise exception using errcode='22023',message='Invalid team member';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_email,0));
 if not private.local_team_access_authorized(p_gate,p_clinic_id) then raise exception using errcode='42501',message='Team access denied';end if;
 select * into v_row from private.local_team_provisioning_reservations r where r.clinic_id=p_clinic_id and r.actor_id=v_actor and r.request_key=p_request_key for update;
 if found then
   if v_row.request_fingerprint is distinct from p_fingerprint or v_row.email_normalized is distinct from v_email or v_row.display_name is distinct from btrim(p_display_name) or v_row.roles is distinct from p_roles then raise exception using errcode='23505',message='Idempotency key conflict';end if;
   return jsonb_build_object('reservation_id',v_row.reservation_id,'auth_user_id',v_row.auth_user_id,'completed',v_row.completed_at is not null,'replayed',true);
 end if;
 if exists(select 1 from private.local_team_provisioning_reservations r where r.email_normalized=v_email) then raise exception using errcode='23505',message='Email is reserved';end if;
 insert into private.local_team_provisioning_reservations(clinic_id,actor_id,request_key,email_normalized,request_fingerprint,display_name,roles)
 values(p_clinic_id,v_actor,p_request_key,v_email,p_fingerprint,btrim(p_display_name),p_roles) returning * into v_row;
 return jsonb_build_object('reservation_id',v_row.reservation_id,'auth_user_id',null,'completed',false,'replayed',false);
end $$;
revoke all on function public.reserve_local_team_member(uuid,text,text,text,text[],uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_local_team_member(uuid,text,text,text,text[],uuid,text) to authenticated;

create or replace function public.finalize_local_team_member(p_clinic_id uuid,p_reservation_id uuid,p_auth_user_id uuid,p_request_key uuid,p_gate text)
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
  if v_res.auth_user_id is distinct from p_auth_user_id then raise exception using errcode='42501',message='Team access denied';end if;
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
