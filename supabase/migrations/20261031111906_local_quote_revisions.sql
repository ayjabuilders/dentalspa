-- Immutable local draft revisions share the existing gated, transactional save kernel.
begin;
create function private.save_local_quote_draft(p_clinic_id uuid,p_patient_id uuid,p_payload jsonb,p_request_key uuid,p_gate text,p_quote_id uuid,p_expected_version integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_actor uuid; v_prior private.finance_draft_commands; v_quote uuid:=coalesce(p_quote_id,gen_random_uuid()); v_version integer:=1; v_command jsonb; v_event text;
  v_line jsonb; v_service private.finance_catalog_services; v_price private.finance_catalog_price_versions;
  v_lines jsonb:='[]'; v_total bigint:=0; v_quantity integer; v_number integer:=0; v_receipt jsonb;
begin
  v_actor:=private.authorize_local_quote_draft(p_clinic_id,p_gate);
  if p_request_key is null or p_patient_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or p_payload-'lines'<>'{}'::jsonb or not(p_payload?'lines') or jsonb_typeof(p_payload->'lines')<>'array' then
    raise exception using errcode='22023',message='invalid_quote_command';
  end if;
  if jsonb_array_length(p_payload->'lines') not between 1 and 50 then raise exception using errcode='22023',message='invalid_quote_lines'; end if;
  if (p_quote_id is null)<>(p_expected_version is null) or (p_expected_version is not null and (p_expected_version<1 or p_expected_version>=2147483647)) then
    raise exception using errcode='22023',message='invalid_quote_revision';
  end if;
  v_command:=case when p_quote_id is null then p_payload else p_payload||jsonb_build_object('quote_id',p_quote_id,'expected_version',p_expected_version) end;
  v_event:=case when p_quote_id is null then 'LocalQuoteDraftCreated' else 'LocalQuoteDraftRevised' end;
  perform pg_advisory_xact_lock(hashtextextended('quote-draft:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
  select * into v_prior from private.finance_draft_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.patient_id<>p_patient_id or v_prior.payload<>v_command then raise exception using errcode='SH410',message='command_key_reused'; end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  perform 1 from public.patients where clinic_id=p_clinic_id and id=p_patient_id for share;
  if not found then raise exception using errcode='PT404',message='patient_unavailable'; end if;
  if p_quote_id is not null then
    perform 1 from private.finance_quotes where clinic_id=p_clinic_id and id=p_quote_id and patient_id=p_patient_id for update;
    if not found then raise exception using errcode='PT404',message='quote_unavailable'; end if;
    select max(version) into v_version from private.finance_quote_versions where clinic_id=p_clinic_id and quote_id=p_quote_id;
    if v_version is distinct from p_expected_version then raise exception using errcode='SH409',message='quote_version_changed'; end if;
    v_version:=v_version+1;
  end if;
  for v_line in select value from jsonb_array_elements(p_payload->'lines') loop
    if jsonb_typeof(v_line)<>'object' or v_line-array['service_id','price_version','quantity']<>'{}'::jsonb
      or not(v_line?&array['service_id','price_version','quantity'])
      or jsonb_typeof(v_line->'service_id')<>'string' or jsonb_typeof(v_line->'price_version')<>'number' or jsonb_typeof(v_line->'quantity')<>'number'
      or (v_line->>'price_version')!~'^[1-9][0-9]{0,8}$' or (v_line->>'quantity')!~'^[1-9][0-9]{0,2}$'
      or (v_line->>'service_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='invalid_quote_line';
    end if;
    v_quantity:=(v_line->>'quantity')::integer;
    if v_quantity>100 or exists(select 1 from jsonb_array_elements(v_lines) x where x->>'service_id'=v_line->>'service_id') then raise exception using errcode='22023',message='invalid_quote_line'; end if;
    select * into v_service from private.finance_catalog_services where clinic_id=p_clinic_id and id=(v_line->>'service_id')::uuid and archived_at is null for share;
    if not found then raise exception using errcode='PT404',message='service_unavailable'; end if;
    select * into v_price from private.finance_catalog_price_versions where clinic_id=p_clinic_id and service_id=v_service.id and effective_from<=clock_timestamp() order by version desc limit 1;
    if not found or v_price.version<>(v_line->>'price_version')::integer then raise exception using errcode='SH409',message='price_changed'; end if;
    if v_price.currency_code<>'MAD' or v_price.unit_amount_minor>10000000000 then raise exception using errcode='22023',message='unsupported_price'; end if;
    v_total:=v_total+v_quantity::bigint*v_price.unit_amount_minor;
    if v_total>1000000000000 then raise exception using errcode='22023',message='quote_limit'; end if;
    v_number:=v_number+1;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('service_id',v_service.id,'price_version',v_price.version,'label',v_service.service_name,'quantity',v_quantity,'unit',v_price.unit_amount_minor,'line_number',v_number));
  end loop;
  if p_quote_id is null then insert into private.finance_quotes(clinic_id,id,patient_id,created_by) values(p_clinic_id,v_quote,p_patient_id,v_actor); end if;
  -- Tax/discount disabled in this local fixture. No exemption or approval is implied.
  insert into private.finance_quote_versions(clinic_id,quote_id,version,currency_code,subtotal_minor,discount_minor,tax_minor,created_by)
    values(p_clinic_id,v_quote,v_version,'MAD',v_total,0,0,v_actor);
  insert into private.finance_quote_lines(clinic_id,quote_id,quote_version,line_number,service_id,price_version,label_snapshot,quantity,unit_amount_minor,discount_minor,tax_minor)
    select p_clinic_id,v_quote,v_version,(x->>'line_number')::integer,(x->>'service_id')::uuid,(x->>'price_version')::integer,x->>'label',(x->>'quantity')::integer,(x->>'unit')::bigint,0,0 from jsonb_array_elements(v_lines) x;
  v_receipt:=jsonb_build_object('quote_id',v_quote,'patient_id',p_patient_id,'version',v_version,'state','draft','currency_code','MAD','total_minor',v_total,'replayed',false);
  insert into private.finance_draft_commands(clinic_id,actor_ref,request_key,patient_id,payload,receipt) values(p_clinic_id,v_actor,p_request_key,p_patient_id,v_command,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,v_event,v_quote,p_request_key);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload)
    values(p_clinic_id,v_event,1,'finance_quote',v_quote,p_request_key,v_actor,jsonb_build_object('quote_version',v_version,'synthetic_only',true));
  return v_receipt;
end $$;
revoke all on function private.save_local_quote_draft(uuid,uuid,jsonb,uuid,text,uuid,integer) from public,anon,authenticated,service_role;
create or replace function public.create_local_quote_draft(p_clinic_id uuid,p_patient_id uuid,p_payload jsonb,p_request_key uuid,p_gate text)
returns jsonb language sql security definer set search_path='' as $$
  select private.save_local_quote_draft(p_clinic_id,p_patient_id,p_payload,p_request_key,p_gate,null,null)
$$;
create function public.revise_local_quote_draft(p_clinic_id uuid,p_patient_id uuid,p_quote_id uuid,p_expected_version integer,p_payload jsonb,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_quote_id is null or p_expected_version is null then raise exception using errcode='22023',message='invalid_quote_revision'; end if;
  return private.save_local_quote_draft(p_clinic_id,p_patient_id,p_payload,p_request_key,p_gate,p_quote_id,p_expected_version);
end $$;
revoke all on function public.create_local_quote_draft(uuid,uuid,jsonb,uuid,text),public.revise_local_quote_draft(uuid,uuid,uuid,integer,jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.create_local_quote_draft(uuid,uuid,jsonb,uuid,text),public.revise_local_quote_draft(uuid,uuid,uuid,integer,jsonb,uuid,text) to authenticated;

commit;
