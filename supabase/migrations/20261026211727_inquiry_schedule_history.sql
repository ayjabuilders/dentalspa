-- Current-owner, own-receipt history. No write activation or event emission.
create function public.inquiry_schedule_history(p_clinic_id uuid,p_inquiry_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_owner uuid;v_items jsonb;v_count integer;
begin
 v_actor:=private.require_intake_staff(p_clinic_id);
 if p_inquiry_id is null or coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid history request';end if;
 -- Hold ownership stable until the projection completes, then recheck active authority.
 select owner_user_id into v_owner from public.inquiries where clinic_id=p_clinic_id and id=p_inquiry_id for share;
 if not found then raise exception using errcode='PT404',message='Inquiry not found';end if;
 perform private.require_intake_staff(p_clinic_id);
 if v_owner<>v_actor then raise exception using errcode='PT404',message='Inquiry not found';end if;
 with recent as (
  select receipt,request_key,private.inquiry_schedule_instant(receipt->'recorded_at') recorded_at
  from private.inquiry_schedule_receipts
  where clinic_id=p_clinic_id and actor_id=v_actor and inquiry_id=p_inquiry_id and command='set_follow_up_schedule'
  order by private.inquiry_schedule_instant(receipt->'recorded_at') desc,request_key desc limit 51
 ),numbered as(select *,row_number()over(order by recorded_at desc,request_key desc) n from recent)
 select coalesce(jsonb_agg(jsonb_build_object('previous_follow_up_at',receipt->'previous_follow_up_at','follow_up_at',receipt->'follow_up_at','changed',receipt->'changed','recorded_at',receipt->'recorded_at','event_version',receipt->'event_version') order by n) filter(where n<=50),'[]'::jsonb),count(*) into v_items,v_count from numbered;
 return jsonb_build_object('inquiry_id',p_inquiry_id,'items',v_items,'truncated',v_count>50);
end $$;
revoke all on function public.inquiry_schedule_history(uuid,uuid) from public,anon,authenticated;
grant execute on function public.inquiry_schedule_history(uuid,uuid) to authenticated;
