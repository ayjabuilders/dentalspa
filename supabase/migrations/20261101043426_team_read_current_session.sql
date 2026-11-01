-- Keep team projections read-only and tenant-scoped; reject revoked or expired sessions.
create or replace function public.team_roster(p_clinic_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_observed timestamptz:=statement_timestamp();v_members jsonb;v_count integer;
begin
  if v_actor is null or not public.is_current_session_active() then raise exception using errcode='28000',message='Authentication required';end if;
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

create or replace function public.team_activity(p_clinic_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare
  v_actor uuid:=auth.uid();
  v_observed timestamptz:=statement_timestamp();
  v_items jsonb;
  v_count integer;
begin
  if v_actor is null or not public.is_current_session_active() then raise exception using errcode='28000',message='Authentication required';end if;
  if p_clinic_id is null or not exists(
    select 1 from public.clinic_memberships
    where clinic_id=p_clinic_id and user_id=v_actor and active and role='manager'
  ) then raise exception using errcode='42501',message='Team activity scope denied';end if;
  if coalesce(current_setting('request.method',true),'')<>'POST' then
    raise exception using errcode='22023',message='Invalid activity request';
  end if;

  with recent as (
    select id,actor_ref,action,occurred_at from private.audit_events
    where clinic_id=p_clinic_id and action in (
      'InquiryCreated','InquiryFollowUpRecorded','SlotHoldCreated','SlotHoldReleased','PatientProfileViewed',
      'InquiryFollowUpScheduleChanged','InquiryPlannedActionChanged','InquiryOwnerReassigned'
    )
    order by occurred_at desc,id desc limit 51
  ), numbered as (
    select
      case r.action
        when 'InquiryCreated' then 'inquiry_created'
        when 'InquiryFollowUpRecorded' then 'inquiry_follow_up_recorded'
        when 'SlotHoldCreated' then 'slot_hold_created'
        when 'SlotHoldReleased' then 'slot_hold_released'
        when 'PatientProfileViewed' then 'patient_profile_viewed'
        when 'InquiryFollowUpScheduleChanged' then 'inquiry_follow_up_schedule_changed'
        when 'InquiryPlannedActionChanged' then 'inquiry_planned_action_changed'
        when 'InquiryOwnerReassigned' then 'inquiry_owner_reassigned'
      end kind,
      case when r.action='PatientProfileViewed' then null else p.display_name end actor_display_name,
      r.occurred_at,
      row_number() over(order by r.occurred_at desc,r.id desc) n
    from recent r left join public.profiles p on p.user_id=r.actor_ref
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'kind',kind,'actor_display_name',actor_display_name,'occurred_at',occurred_at
    ) order by n) filter(where n<=50),'[]'::jsonb),
    count(*)
  into v_items,v_count from numbered;

  return jsonb_build_object('observed_at',v_observed,'items',v_items,'truncated',v_count>50);
end $$;

revoke all on function public.team_activity(uuid) from public,anon,authenticated;
grant execute on function public.team_activity(uuid) to authenticated;
