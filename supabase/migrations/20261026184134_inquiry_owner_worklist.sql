-- Read-only owner projection. No command settings, inquiry mutation or audit/outbox write.
create index inquiry_owner_due on public.inquiries(clinic_id,owner_user_id,follow_up_at,id);
create index inquiry_owner_undated on public.inquiries(clinic_id,owner_user_id,created_at desc,id desc) where follow_up_at is null;

create function public.inquiry_owner_worklist(p_clinic_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_observed timestamptz:=statement_timestamp();v_result jsonb;
begin
  v_actor:=private.require_intake_staff(p_clinic_id);
  if coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid inquiry request';end if;
  -- One database statement-start observation and one projection snapshot across all buckets.
  -- Explicit fields omit contact data; NOT MATERIALIZED permits bounded index scans.
  with owned as not materialized (
    select id,clinic_id,owner_user_id,display_name,source,status,follow_up_at,created_at
    from public.inquiries where clinic_id=p_clinic_id and owner_user_id=v_actor
  )
  select jsonb_build_object('observed_at',v_observed,
    'overdue',(select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by n) filter(where n<=50),'[]'::jsonb),'truncated',count(*)>50)
      from(select recent.*,row_number()over(order by follow_up_at,id) n from(select * from owned where follow_up_at<=v_observed order by follow_up_at,id limit 51)recent)numbered),
    'upcoming',(select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by n) filter(where n<=50),'[]'::jsonb),'truncated',count(*)>50)
      from(select recent.*,row_number()over(order by follow_up_at,id) n from(select * from owned where follow_up_at>v_observed order by follow_up_at,id limit 51)recent)numbered),
    'undated',(select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(numbered)-'n' order by n) filter(where n<=50),'[]'::jsonb),'truncated',count(*)>50)
      from(select recent.*,row_number()over(order by created_at desc,id desc) n from(select * from owned where follow_up_at is null order by created_at desc,id desc limit 51)recent)numbered)
  ) into v_result;
  return v_result;
end $$;

create function public.get_owned_inquiry(p_clinic_id uuid,p_inquiry_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid;v_item public.inquiries;
begin
  v_actor:=private.require_intake_staff(p_clinic_id);
  if p_inquiry_id is null or coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid inquiry request';end if;
  select * into v_item from public.inquiries where clinic_id=p_clinic_id and id=p_inquiry_id and owner_user_id=v_actor;
  if not found then raise exception using errcode='PT404',message='Inquiry not found';end if;
  return to_jsonb(v_item);
end $$;
revoke all on function public.inquiry_owner_worklist(uuid),public.get_owned_inquiry(uuid,uuid) from public,anon,authenticated;
grant execute on function public.inquiry_owner_worklist(uuid),public.get_owned_inquiry(uuid,uuid) to authenticated;
