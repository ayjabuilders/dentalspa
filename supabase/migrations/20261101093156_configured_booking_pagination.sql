begin;
-- Keep the original bounded endpoint compatible while adding server discovery.
create function public.list_configured_booking_requests_page(
 p_clinic_id uuid,p_offset integer default 0,p_limit integer default 10,
 p_query text default '',p_status text default 'all'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_revision integer;v_enabled boolean;
begin
 if auth.uid() is null or not exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>clock_timestamp())) then raise exception using errcode='28000',message='unauthenticated';end if;
 if not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=auth.uid() and active and role in ('reception','manager')) then raise exception using errcode='42501',message='forbidden';end if;
 if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>100 or p_query is null or char_length(p_query)>100 or p_status is null or p_status not in ('all','request_received','confirmed','cancelled') then raise exception using errcode='22023',message='invalid_page';end if;
 select max(revision) into v_revision from private.agenda_configuration_versions where clinic_id=p_clinic_id;
 select enabled and synthetic_only and confirmations_enabled into v_enabled from private.agenda_configuration_gates where clinic_id=p_clinic_id;
 with records as materialized (
  select r.id,r.contact_name,r.contact_email,r.canonical_payload->>'contact_phone' contact_phone,
   coalesce(a.starts_at,r.starts_at) starts_at,coalesce(a.ends_at,r.ends_at) ends_at,r.created_at,r.configuration_revision,
   coalesce(a.status,'request_received') status,
   case when a.id is null then null else jsonb_build_object('id',a.id,'status',a.status,'version',a.version) end appointment,
   (select t->>'name' from jsonb_array_elements(v.configuration->'visit_types') t where t->>'id'=r.visit_type_id::text) visit_name
  from private.configured_booking_requests r
  join private.agenda_configuration_versions v on v.clinic_id=r.clinic_id and v.revision=r.configuration_revision
  left join private.configured_appointments a on a.clinic_id=r.clinic_id and a.request_id=r.id
  where r.clinic_id=p_clinic_id
 ), filtered as materialized (
  select * from records where (p_status='all' or status=p_status)
   and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(concat_ws(' ',contact_name,contact_email,contact_phone,visit_name)))>0)
 ), page as (
  select * from filtered order by created_at desc,id offset p_offset limit p_limit
 ), totals as (
  select count(*) all_count,count(*) filter(where status='request_received') pending,
   count(*) filter(where status='confirmed') confirmed,count(*) filter(where status='cancelled') cancelled from records
 )
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'contact_name',contact_name,'contact_email',contact_email,'contact_phone',contact_phone,
   'visit_name',visit_name,'starts_at',private.scheduling_time(starts_at),'ends_at',private.scheduling_time(ends_at),'status',status,'appointment',appointment,
   'created_at',private.scheduling_time(created_at),'configuration_revision',configuration_revision) order by created_at desc,id) from page),'[]'::jsonb),
  'truncated',(select count(*) from filtered)>p_offset+p_limit,
  'total_count',(select count(*) from filtered),
  'counts',jsonb_build_object('all',all_count,'request_received',pending,'confirmed',confirmed,'cancelled',cancelled),
  'current_revision',v_revision,'confirmation_enabled',coalesce(v_enabled,false)
 ) into v_result from totals;
 return v_result;
end $$;
revoke all on function public.list_configured_booking_requests_page(uuid,integer,integer,text,text) from public,anon;
grant execute on function public.list_configured_booking_requests_page(uuid,integer,integer,text,text) to authenticated;
commit;
