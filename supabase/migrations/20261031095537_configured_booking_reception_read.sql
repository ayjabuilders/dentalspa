create function public.list_local_configured_booking_requests(p_clinic_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;v_count integer;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='unauthenticated';end if;
  if not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic_id
    and user_id=auth.uid() and active and role in ('reception','manager')) then
    raise exception using errcode='42501',message='forbidden';
  end if;
  with limited as (
    select r.id,r.contact_name,r.contact_email,r.starts_at,r.ends_at,r.status,r.created_at,r.configuration_revision,
      (select type->>'name' from jsonb_array_elements(v.configuration->'visit_types') type where type->>'id'=r.visit_type_id::text) visit_name
    from private.configured_booking_requests r
    join private.agenda_configuration_versions v on v.clinic_id=r.clinic_id and v.revision=r.configuration_revision
    where r.clinic_id=p_clinic_id order by r.created_at desc,r.id limit 101
  ),numbered as(select *,row_number() over(order by created_at desc,id) n from limited)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'contact_name',contact_name,'contact_email',contact_email,
    'visit_name',visit_name,'starts_at',private.scheduling_time(starts_at),'ends_at',private.scheduling_time(ends_at),
    'status',status,'created_at',private.scheduling_time(created_at),'configuration_revision',configuration_revision) order by n)
    filter(where n<=100),'[]'::jsonb),count(*) into v_items,v_count from numbered;
  return jsonb_build_object('items',v_items,'truncated',v_count>100);
end $$;
revoke all on function public.list_local_configured_booking_requests(uuid) from public,anon,authenticated;
grant execute on function public.list_local_configured_booking_requests(uuid) to authenticated;
