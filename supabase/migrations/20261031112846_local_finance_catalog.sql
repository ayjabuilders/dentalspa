begin;
create table private.finance_catalog_commands (
  clinic_id uuid not null references public.clinics(id),actor_ref uuid not null references auth.users(id),request_key uuid not null,
  payload jsonb not null,receipt jsonb not null,created_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,actor_ref,request_key)
);
alter table private.finance_catalog_commands enable row level security;
revoke all on private.finance_catalog_commands from public,anon,authenticated,service_role;
create trigger finance_catalog_command_immutable before update or delete on private.finance_catalog_commands
  for each row execute function private.reject_finance_snapshot_mutation();

create function public.read_local_finance_catalog(p_clinic_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;
begin
  perform private.authorize_local_quote_draft(p_clinic_id,p_gate);
  select coalesce(jsonb_agg(jsonb_build_object('service_id',s.id,'code',s.service_code,'label',s.service_name,'category',s.category_code,'archived',s.archived_at is not null,
    'price_version',p.version,'unit_amount_minor',p.unit_amount_minor,'currency_code',p.currency_code,
    'effective_at',to_char(p.effective_from at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by s.service_code),'[]'::jsonb)
  into v_items from private.finance_catalog_services s join lateral(select v.* from private.finance_catalog_price_versions v where v.clinic_id=s.clinic_id and v.service_id=s.id order by v.version desc limit 1) p on true
  where s.clinic_id=p_clinic_id;
  return jsonb_build_object('items',v_items,'synthetic_only',true);
end $$;

create function public.save_local_finance_service(p_clinic_id uuid,p_payload jsonb,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid;v_prior private.finance_catalog_commands;v_service uuid;v_expected integer;v_version integer;v_receipt jsonb;
  v_code text;v_label text;v_category text;v_amount bigint;v_archived boolean;v_effective timestamptz:=clock_timestamp();
begin
  v_actor:=private.authorize_local_quote_draft(p_clinic_id,p_gate);
  if p_request_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or p_payload-array['service_id','expected_version','code','label','category','unit_amount_minor','archived']<>'{}'::jsonb
    or not(p_payload?&array['service_id','expected_version','code','label','category','unit_amount_minor','archived']) then
    raise exception using errcode='22023',message='invalid_catalog_command';
  end if;
  if jsonb_typeof(p_payload->'service_id') not in ('null','string')
    or (jsonb_typeof(p_payload->'service_id')='string' and (p_payload->>'service_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or jsonb_typeof(p_payload->'expected_version')<>'number' or (p_payload->>'expected_version')!~'^(0|[1-9][0-9]{0,8})$'
    or jsonb_typeof(p_payload->'code')<>'string' or (p_payload->>'code')!~'^[A-Z0-9][A-Z0-9_-]{0,59}$'
    or jsonb_typeof(p_payload->'label')<>'string' or char_length(btrim(p_payload->>'label')) not between 1 and 160
    or jsonb_typeof(p_payload->'category') not in ('null','string') or char_length(p_payload->>'category')>60
    or jsonb_typeof(p_payload->'unit_amount_minor')<>'number' or (p_payload->>'unit_amount_minor')!~'^[1-9][0-9]{0,10}$'
    or jsonb_typeof(p_payload->'archived')<>'boolean' then raise exception using errcode='22023',message='invalid_catalog_fields'; end if;
  v_service:=(p_payload->>'service_id')::uuid;v_expected:=(p_payload->>'expected_version')::integer;
  v_amount:=(p_payload->>'unit_amount_minor')::bigint;v_archived:=(p_payload->>'archived')::boolean;
  v_code:=p_payload->>'code';v_label:=btrim(p_payload->>'label');v_category:=nullif(btrim(p_payload->>'category'),'');
  if v_expected>=999999999 or v_amount>10000000000 or (v_service is null and (v_expected<>0 or v_archived)) or (v_service is not null and v_expected<1) then raise exception using errcode='22023',message='invalid_catalog_fields'; end if;
  perform pg_advisory_xact_lock(hashtextextended('finance-catalog:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
  select * into v_prior from private.finance_catalog_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.payload<>p_payload then raise exception using errcode='SH410',message='command_key_reused'; end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  if v_service is null then
    v_service:=gen_random_uuid();v_version:=1;
    insert into private.finance_catalog_services(clinic_id,id,service_code,service_name,category_code) values(p_clinic_id,v_service,v_code,v_label,v_category);
  else
    perform 1 from private.finance_catalog_services where clinic_id=p_clinic_id and id=v_service for update;
    if not found then raise exception using errcode='PT404',message='service_unavailable'; end if;
    select max(version) into v_version from private.finance_catalog_price_versions where clinic_id=p_clinic_id and service_id=v_service;
    if v_version is distinct from v_expected then raise exception using errcode='SH409',message='catalog_version_changed'; end if;
    v_version:=v_version+1;
    update private.finance_catalog_services set service_code=v_code,service_name=v_label,category_code=v_category,archived_at=case when v_archived then coalesce(archived_at,v_effective) else null end where clinic_id=p_clinic_id and id=v_service;
  end if;
  insert into private.finance_catalog_price_versions(clinic_id,service_id,version,unit_amount_minor,currency_code,effective_from,created_by)
    values(p_clinic_id,v_service,v_version,v_amount,'MAD',v_effective,v_actor);
  v_receipt:=jsonb_build_object('service_id',v_service,'price_version',v_version,'code',v_code,'label',v_label,'category',v_category,'archived',v_archived,'unit_amount_minor',v_amount,'currency_code','MAD',
    'effective_at',to_char(v_effective at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'replayed',false);
  insert into private.finance_catalog_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,p_payload,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalFinanceServiceSaved',v_service,p_request_key);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload)
    values(p_clinic_id,'LocalFinanceServiceSaved',1,'finance_catalog_service',v_service,p_request_key,v_actor,jsonb_build_object('price_version',v_version,'synthetic_only',true));
  return v_receipt;
exception when unique_violation then raise exception using errcode='SH409',message='catalog_conflict';
end $$;
revoke all on function public.read_local_finance_catalog(uuid,text),public.save_local_finance_service(uuid,jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_local_finance_catalog(uuid,text),public.save_local_finance_service(uuid,jsonb,uuid,text) to authenticated;
commit;
