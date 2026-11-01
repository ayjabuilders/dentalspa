-- A cached command state must not report access as active after membership revocation.
-- Read projection only: no membership, role, command version, or audit history is changed.
create or replace function public.list_team_access_members(p_clinic_id uuid,p_query text,p_cursor text,p_gate text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;v_next text;v_count integer;v_cut timestamptz;v_cut_id uuid;v_q text:=nullif(btrim(p_query),'');
begin
 if not private.local_team_access_authorized(p_gate,p_clinic_id) then raise exception using errcode='42501',message='Team access denied';end if;
 if coalesce(current_setting('request.method',true),'')<>'POST' or p_query is not null and (length(p_query)>100 or btrim(p_query)<>p_query) then raise exception using errcode='22023',message='Invalid team access query';end if;
 if p_cursor is not null then
   if p_cursor !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\|[0-9a-fA-F-]{36}$' then raise exception using errcode='22023',message='Invalid team access cursor';end if;
   v_cut:=split_part(p_cursor,'|',1)::timestamptz;v_cut_id:=split_part(p_cursor,'|',2)::uuid;
 end if;
 with members as (
  select m.user_id,coalesce(p.display_name,u.email) display_name,u.email,
    coalesce(s.roles,array_agg(distinct m.role collate "C" order by m.role collate "C")) roles,
    (coalesce(s.active,true) and bool_or(m.active)) active,coalesce(s.version,1) version,
    min(m.created_at) created_at
  from public.clinic_memberships m
  join auth.users u on u.id=m.user_id
  left join public.profiles p on p.user_id=m.user_id
  left join private.team_access_member_state s on s.clinic_id=m.clinic_id and s.user_id=m.user_id
  where m.clinic_id=p_clinic_id
  group by m.user_id,p.display_name,u.email,s.roles,s.active,s.version
 ),filtered as (
  select * from members x where (v_q is null or position(lower(v_q) in lower(x.display_name||' '||x.email))>0)
   and (v_cut is null or (x.created_at,x.user_id)>(v_cut,v_cut_id))
 ),page as (
  select * from filtered order by created_at,user_id limit 11
 ),numbered as (
  select *,row_number() over(order by created_at,user_id) n from page
 )
 select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'display_name',display_name,'email',email,'roles',roles,'active',active,'version',version,'created_at',created_at) order by n) filter(where n<=10),'[]'::jsonb),
   (select count(*) from numbered),
   (select to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')||'|'||user_id::text from numbered where n=10)
 into v_rows,v_count,v_next from numbered;
 return jsonb_build_object('schema_version',1,'clinic_id',p_clinic_id,'current_user_id',auth.uid(),'items',v_rows,'next_cursor',case when v_count>10 then v_next else null end,
 'clinical_role_notice','Clinical roles grant application access only; they do not verify professional qualifications.');
end $$;
revoke all on function public.list_team_access_members(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.list_team_access_members(uuid,text,text,text) to authenticated;

