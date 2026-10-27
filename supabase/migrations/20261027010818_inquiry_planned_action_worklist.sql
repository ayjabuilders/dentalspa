-- Owner-only read projection. No write activation, locks, receipts or events.
create function public.inquiry_owner_planned_actions(p_clinic_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_result jsonb;
begin
 v_actor:=private.require_intake_staff(p_clinic_id);
 if coalesce(current_setting('request.method',true),'')<>'POST' then
  raise exception using errcode='22023',message='Invalid worklist request';
 end if;
 with observation as materialized (select clock_timestamp() observed_at),
 candidates as materialized (
  select i.id inquiry_id,i.display_name,p.planned_action,p.revision,p.updated_at
  from public.inquiries i
  join private.inquiry_planned_actions p on p.clinic_id=i.clinic_id and p.inquiry_id=i.id
  where i.clinic_id=p_clinic_id and i.owner_user_id=v_actor and p.planned_action is not null
  order by p.updated_at desc,i.id desc limit 51
 ), visible as (select * from candidates order by updated_at desc,inquiry_id desc limit 50)
 select jsonb_build_object(
  'schema_version',1,'clinic_id',p_clinic_id,'owner_user_id',v_actor,
  'observed_at',to_char(observation.observed_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'inquiry_id',inquiry_id,'display_name',display_name,'planned_action',planned_action,
   'vocabulary_version',1,'revision',revision,
   'updated_at',to_char(updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  ) order by updated_at desc,inquiry_id desc) from visible),'[]'::jsonb),
  'truncated',(select count(*)>50 from candidates)
 ) into v_result from observation;
 return v_result;
end $$;
revoke all on function public.inquiry_owner_planned_actions(uuid) from public,anon,authenticated;
grant execute on function public.inquiry_owner_planned_actions(uuid) to authenticated;
