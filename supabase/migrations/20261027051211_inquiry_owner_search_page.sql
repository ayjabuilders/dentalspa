-- Owner-only navigation, not patient matching. No write activation or audit effects.
create function public.inquiry_owner_search_page(p_clinic_id uuid,p_payload jsonb) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_name text;v_pattern text;v_items jsonb;v_count integer;v_before jsonb;v_time timestamptz;v_id uuid;v_next jsonb;
begin
 v_actor:=private.require_intake_staff(p_clinic_id);
 if coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid search request';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='Invalid search request';end if;
 if not(p_payload ?& array['name','before']) or (select count(*) from jsonb_object_keys(p_payload))<>2 or jsonb_typeof(p_payload->'name')<>'string' then raise exception using errcode='22023',message='Invalid search request';end if;
 v_name:=p_payload->>'name';
 if v_name<>btrim(v_name,' ') or char_length(v_name) not between 2 and 80 or exists(select 1 from regexp_split_to_table(v_name,'') c where ascii(c)<32 or ascii(c)=127) then raise exception using errcode='22023',message='Invalid search request';end if;
 v_before:=p_payload->'before';
 if v_before<>'null'::jsonb then
  if jsonb_typeof(v_before)<>'object' then raise exception using errcode='22023',message='Invalid search request';end if;
  if not(v_before ?& array['created_at','inquiry_id']) or (select count(*) from jsonb_object_keys(v_before))<>2 or jsonb_typeof(v_before->'created_at')<>'string' or jsonb_typeof(v_before->'inquiry_id')<>'string' then raise exception using errcode='22023',message='Invalid search request';end if;
  if (v_before->>'inquiry_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' and lower(v_before->>'inquiry_id') not in ('00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff') then raise exception using errcode='22023',message='Invalid search request';end if;
  v_time:=private.inquiry_schedule_instant(v_before->'created_at');v_id:=(v_before->>'inquiry_id')::uuid;
 end if;
 -- Escape the escape character first. Actual database collation determines ILIKE.
 v_pattern:='%'||replace(replace(replace(v_name,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 with matched as (
  select id,display_name,source,status,follow_up_at,created_at from public.inquiries
  where clinic_id=p_clinic_id and owner_user_id=v_actor and display_name ilike v_pattern escape E'\\'
  and (v_before='null'::jsonb or (created_at,id)<(v_time,v_id))
  order by created_at desc,id desc limit 51
 ),numbered as(select *,row_number()over(order by created_at desc,id desc) n from matched)
 select coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by n) filter(where n<=50),'[]'::jsonb),count(*) into v_items,v_count from numbered;
 if v_count>50 then v_next:=jsonb_build_object('created_at',v_items->49->'created_at','inquiry_id',v_items->49->'id');else v_next:='null'::jsonb;end if;
 return jsonb_build_object('name',v_name,'before',v_before,'next_before',v_next,'clinic_id',p_clinic_id,'owner_user_id',v_actor,'items',v_items,'truncated',v_count>50);
end $$;
revoke all on function public.inquiry_owner_search_page(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.inquiry_owner_search_page(uuid,jsonb) to authenticated;
