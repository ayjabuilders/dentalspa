-- A stale application version is a business conflict, not a retryable serialization failure.
create or replace function public.update_team_access_member(p_clinic_id uuid,p_target_user_id uuid,p_expected_version integer,p_roles text[],p_active boolean,p_request_key uuid,p_fingerprint text,p_gate text)
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
 if v_state.version<>p_expected_version then raise exception using errcode='PT409',message='Team member version conflict';end if;
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
