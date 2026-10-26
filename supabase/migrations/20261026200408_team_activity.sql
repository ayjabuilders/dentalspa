-- Bounded manager-only projection, not a complete security or clinical audit.
create index audit_team_activity_recent on private.audit_events(clinic_id,occurred_at desc,id desc)
where action in ('InquiryCreated','InquiryFollowUpRecorded','SlotHoldCreated','SlotHoldReleased');
create function public.team_activity(p_clinic_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_observed timestamptz:=statement_timestamp();v_items jsonb;v_count integer;
begin
 if v_actor is null then raise exception using errcode='28000',message='Authentication required';end if;
 if p_clinic_id is null or not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=v_actor and active and role='manager') then raise exception using errcode='42501',message='Team activity scope denied';end if;
 if coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid activity request';end if;
 with recent as (
  select id,actor_ref,action,occurred_at from private.audit_events
  where clinic_id=p_clinic_id and action in ('InquiryCreated','InquiryFollowUpRecorded','SlotHoldCreated','SlotHoldReleased')
  order by occurred_at desc,id desc limit 51
 ),numbered as (
  select case r.action when 'InquiryCreated' then 'inquiry_created' when 'InquiryFollowUpRecorded' then 'inquiry_follow_up_recorded' when 'SlotHoldCreated' then 'slot_hold_created' when 'SlotHoldReleased' then 'slot_hold_released' end kind,
   p.display_name actor_display_name,r.occurred_at,row_number()over(order by r.occurred_at desc,r.id desc) n
  from recent r left join public.profiles p on p.user_id=r.actor_ref
 )
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'actor_display_name',actor_display_name,'occurred_at',occurred_at) order by n) filter(where n<=50),'[]'::jsonb),count(*) into v_items,v_count from numbered;
 return jsonb_build_object('observed_at',v_observed,'items',v_items,'truncated',v_count>50);
end $$;
revoke all on function public.team_activity(uuid) from public,anon,authenticated;
grant execute on function public.team_activity(uuid) to authenticated;
