-- Owner-only navigation, not patient matching. No write activation or audit effects.
create function public.inquiry_owner_search(p_clinic_id uuid,p_payload jsonb) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_name text;v_pattern text;v_items jsonb;v_count integer;
begin
 v_actor:=private.require_intake_staff(p_clinic_id);
 if coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid search request';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='Invalid search request';end if;
 if not(p_payload ? 'name') or (select count(*) from jsonb_object_keys(p_payload))<>1 or jsonb_typeof(p_payload->'name')<>'string' then raise exception using errcode='22023',message='Invalid search request';end if;
 v_name:=p_payload->>'name';
 if v_name<>btrim(v_name,' ') or char_length(v_name) not between 2 and 80 or exists(select 1 from regexp_split_to_table(v_name,'') c where ascii(c)<32 or ascii(c)=127) then raise exception using errcode='22023',message='Invalid search request';end if;
 -- Escape the escape character first. Actual database collation determines ILIKE.
 v_pattern:='%'||replace(replace(replace(v_name,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 with matched as (
  select id,display_name,source,status,follow_up_at,created_at from public.inquiries
  where clinic_id=p_clinic_id and owner_user_id=v_actor and display_name ilike v_pattern escape E'\\'
  order by created_at desc,id desc limit 51
 ),numbered as(select *,row_number()over(order by created_at desc,id desc) n from matched)
 select coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by n) filter(where n<=50),'[]'::jsonb),count(*) into v_items,v_count from numbered;
 return jsonb_build_object('clinic_id',p_clinic_id,'owner_user_id',v_actor,'items',v_items,'truncated',v_count>50);
end $$;
revoke all on function public.inquiry_owner_search(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.inquiry_owner_search(uuid,jsonb) to authenticated;
