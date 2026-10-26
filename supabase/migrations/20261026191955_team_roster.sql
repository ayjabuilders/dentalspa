-- Read-only directory projection. No invitation, staffing or qualification capability.
create index membership_clinic_roster on public.clinic_memberships(clinic_id,user_id) where active;
create function public.team_roster(p_clinic_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_observed timestamptz:=statement_timestamp();v_members jsonb;v_count integer;
begin
  if v_actor is null then raise exception using errcode='28000',message='Authentication required';end if;
  if p_clinic_id is null or not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=v_actor and active and role in ('manager','dentist')) then raise exception using errcode='42501',message='Team roster scope denied';end if;
  if coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid roster request';end if;
  -- Check all active members before joining or limiting. STABLE preserves one
  -- statement snapshot across completeness checking and the resulting directory.
  if exists(select 1 from public.clinic_memberships m where m.clinic_id=p_clinic_id and m.active and not exists(select 1 from public.profiles p where p.user_id=m.user_id)) then
    raise exception using errcode='PT503',message='Team roster unavailable';
  end if;
  with active_members as (
    select user_id,array_agg(distinct role collate "C" order by role collate "C") roles
    from public.clinic_memberships where clinic_id=p_clinic_id and active group by user_id
  ),limited as (
    select m.user_id,p_clinic_id clinic_id,p.display_name,m.roles
    from active_members m join public.profiles p on p.user_id=m.user_id
    order by lower(p.display_name collate "C") collate "C",m.user_id limit 101
  ),numbered as (
    select *,row_number()over(order by lower(display_name collate "C") collate "C",user_id) n from limited
  )
  select coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by n) filter(where n<=100),'[]'::jsonb),count(*) into v_members,v_count from numbered;
  return jsonb_build_object('observed_at',v_observed,'members',v_members,'truncated',v_count>100);
end $$;
revoke all on function public.team_roster(uuid) from public,anon,authenticated;
grant execute on function public.team_roster(uuid) to authenticated;
