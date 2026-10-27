-- Personal command outcomes only. A single snapshot joins current ownership to receipts.
create function public.inquiry_planned_action_history(p_clinic_id uuid,p_inquiry_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_result jsonb;
begin
 v_actor:=private.require_intake_staff(p_clinic_id);
 if p_inquiry_id is null or coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid history request';end if;
 with owned as materialized (
  select id from public.inquiries where clinic_id=p_clinic_id and id=p_inquiry_id and owner_user_id=v_actor
 ),recent as materialized (
  select r.receipt,r.request_key,(r.receipt->>'recorded_at')::timestamptz recorded_at
  from private.inquiry_planned_action_receipts r join owned on owned.id=r.inquiry_id
  where r.clinic_id=p_clinic_id and r.inquiry_id=p_inquiry_id and r.actor_id=v_actor and r.command='set_planned_action'
  order by (r.receipt->>'recorded_at')::timestamptz desc,r.request_key desc limit 51
 ),numbered as(select *,row_number()over(order by recorded_at desc,request_key desc) n from recent)
 select jsonb_build_object('inquiry_id',owned.id,'items',
  coalesce((select jsonb_agg(jsonb_build_object(
   'vocabulary_version',receipt->'vocabulary_version','previous_planned_action',receipt->'previous_planned_action',
   'planned_action',receipt->'planned_action','previous_revision',receipt->'previous_revision',
   'revision',receipt->'revision','changed',receipt->'changed','recorded_at',receipt->'recorded_at','event_version',receipt->'event_version'
  ) order by n) filter(where n<=50) from numbered),'[]'::jsonb),
  'truncated',(select count(*)>50 from recent)) into v_result from owned;
 if v_result is null then raise exception using errcode='PT404',message='Inquiry not found';end if;
 return v_result;
end $$;
revoke all on function public.inquiry_planned_action_history(uuid,uuid) from public,anon,authenticated;
grant execute on function public.inquiry_planned_action_history(uuid,uuid) to authenticated;
