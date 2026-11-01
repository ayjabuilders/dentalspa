create or replace function public.list_local_configured_booking_requests(p_clinic_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;v_count integer;v_revision integer;v_enabled boolean;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='unauthenticated';end if;
  if not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic_id
    and user_id=auth.uid() and active and role in ('reception','manager')) then
    raise exception using errcode='42501',message='forbidden';end if;
  select max(revision) into v_revision from private.agenda_configuration_versions where clinic_id=p_clinic_id;
  select enabled and synthetic_only and confirmations_enabled into v_enabled from private.agenda_configuration_gates where clinic_id=p_clinic_id;
  with limited as (
    select r.id,r.contact_name,r.contact_email,r.starts_at,r.ends_at,r.created_at,r.configuration_revision,
      coalesce(a.status,'request_received') status,
      case when a.id is null then null else jsonb_build_object('id',a.id,'status',a.status,'version',a.version) end appointment,
      (select type->>'name' from jsonb_array_elements(v.configuration->'visit_types') type where type->>'id'=r.visit_type_id::text) visit_name
    from private.configured_booking_requests r
    join private.agenda_configuration_versions v on v.clinic_id=r.clinic_id and v.revision=r.configuration_revision
    left join private.configured_appointments a on a.clinic_id=r.clinic_id and a.request_id=r.id
    where r.clinic_id=p_clinic_id order by r.created_at desc,r.id limit 101
  ),numbered as(select *,row_number() over(order by created_at desc,id) n from limited)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'contact_name',contact_name,'contact_email',contact_email,
    'visit_name',visit_name,'starts_at',private.scheduling_time(starts_at),'ends_at',private.scheduling_time(ends_at),
    'status',status,'appointment',appointment,'created_at',private.scheduling_time(created_at),'configuration_revision',configuration_revision) order by n)
    filter(where n<=100),'[]'::jsonb),count(*) into v_items,v_count from numbered;
  return jsonb_build_object('items',v_items,'truncated',v_count>100,'current_revision',v_revision,'confirmation_enabled',coalesce(v_enabled,false));
end $$;
revoke all on function public.list_local_configured_booking_requests(uuid) from public,anon,authenticated;
grant execute on function public.list_local_configured_booking_requests(uuid) to authenticated;

create or replace function public.list_local_patient_appointments(p_clinic_id uuid,p_from date,p_until date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;v_count integer;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='unauthenticated';end if;
  if not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=auth.uid() and active and role in ('reception','manager','dentist')) then raise exception using errcode='42501',message='forbidden';end if;
  if p_from is null or p_until is null or p_until<p_from or p_until-p_from>30 then raise exception using errcode='22023',message='invalid_range';end if;
  with combined as (
    select a.id,a.starts_at,a.ends_at,a.status,a.version,
      case when p.id is null then null else jsonb_build_object('id',p.id,'display_name',p.display_name,'reference',p.reference) end patient,
      r.display_name provider_name,c.display_name chair_name,'sample'::text source,null::text contact_name,null::text visit_name
    from private.demo_confirmed_appointments a
    left join public.patients p on p.clinic_id=a.clinic_id and p.id=a.patient_id
    join private.demo_booking_sample_resources r on r.clinic_id=a.clinic_id and r.id=a.provider_resource_id
    join private.demo_booking_sample_resources c on c.clinic_id=a.clinic_id and c.id=a.chair_resource_id
    where a.clinic_id=p_clinic_id and a.starts_at>=p_from::timestamp at time zone 'Africa/Casablanca'
      and a.starts_at<(p_until+1)::timestamp at time zone 'Africa/Casablanca'
    union all
    select a.id,a.starts_at,a.ends_at,a.status,a.version,null::jsonb,r.display_name,c.display_name,'configured',q.contact_name,
      (select type->>'name' from jsonb_array_elements(v.configuration->'visit_types') type where type->>'id'=q.visit_type_id::text)
    from private.configured_appointments a
    join private.configured_booking_requests q on q.clinic_id=a.clinic_id and q.id=a.request_id
    join private.agenda_configuration_versions v on v.clinic_id=a.clinic_id and v.revision=a.configuration_revision
    join private.scheduling_resources r on r.clinic_id=a.clinic_id and r.id=a.provider_resource_id
    join private.scheduling_resources c on c.clinic_id=a.clinic_id and c.id=a.chair_resource_id
    where a.clinic_id=p_clinic_id and a.starts_at>=p_from::timestamp at time zone 'Africa/Casablanca'
      and a.starts_at<(p_until+1)::timestamp at time zone 'Africa/Casablanca'
  ),limited as(select * from combined order by starts_at,id limit 501),numbered as(select *,row_number() over(order by starts_at,id) n from limited)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'starts_at',private.scheduling_time(starts_at),
    'ends_at',private.scheduling_time(ends_at),'status',status,'version',version,'patient',patient,'provider_name',provider_name,'chair_name',chair_name,
    'source',source,'contact_name',contact_name,'visit_name',visit_name) order by n) filter(where n<=500),'[]'::jsonb),count(*) into v_items,v_count from numbered;
  return jsonb_build_object('items',v_items,'truncated',v_count>500);
end $$;
revoke all on function public.list_local_patient_appointments(uuid,date,date) from public,anon,authenticated;
grant execute on function public.list_local_patient_appointments(uuid,date,date) to authenticated;
