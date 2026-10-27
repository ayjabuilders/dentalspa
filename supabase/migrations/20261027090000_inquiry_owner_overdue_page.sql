-- Owner-only navigation over fresh administrative deadlines; read-only and bounded.
create function public.inquiry_owner_overdue_page(p_clinic_id uuid,p_payload jsonb) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid; v_after jsonb; v_time timestamptz; v_id uuid; v_observed timestamptz:=statement_timestamp(); v_items jsonb; v_count integer; v_next jsonb;
begin
 v_actor:=private.require_intake_staff(p_clinic_id);
 if coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid overdue page request'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or jsonb_object_length(p_payload)<>1 or not(p_payload ? 'after') then raise exception using errcode='22023',message='Invalid overdue page request'; end if;
 v_after:=p_payload->'after';
 if v_after<>'null'::jsonb then
  if jsonb_typeof(v_after)<>'object' or jsonb_object_length(v_after)<>2 or not(v_after ?& array['follow_up_at','inquiry_id']) or jsonb_typeof(v_after->'follow_up_at')<>'string' or jsonb_typeof(v_after->'inquiry_id')<>'string' then raise exception using errcode='22023',message='Invalid overdue page request'; end if;
  v_time:=private.inquiry_schedule_instant(v_after->'follow_up_at'); v_id:=(v_after->>'inquiry_id')::uuid;
 end if;
 with matched as (
  select id,clinic_id,owner_user_id,display_name,source,status,follow_up_at,created_at
  from public.inquiries
  where clinic_id=p_clinic_id and owner_user_id=v_actor and follow_up_at is not null and follow_up_at<=v_observed
   and (v_after='null'::jsonb or (follow_up_at,id)>(v_time,v_id))
  order by follow_up_at asc,id asc limit 51
 ), numbered as(select *,row_number()over(order by follow_up_at asc,id asc) n from matched)
 select coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by n) filter(where n<=50),'[]'::jsonb),count(*) into v_items,v_count from numbered;
 if v_count>50 then v_next:=jsonb_build_object('follow_up_at',v_items->49->'follow_up_at','inquiry_id',v_items->49->'id'); else v_next:='null'::jsonb; end if;
 return jsonb_build_object('clinic_id',p_clinic_id,'owner_user_id',v_actor,'observed_at',v_observed,'after',v_after,'items',v_items,'truncated',v_count>50,'next_after',v_next);
end $$;
revoke all on function public.inquiry_owner_overdue_page(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.inquiry_owner_overdue_page(uuid,jsonb) to authenticated;
