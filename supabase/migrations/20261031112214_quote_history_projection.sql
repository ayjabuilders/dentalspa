-- Immutable version history and canonical UUID duplicate validation.
begin;
create or replace function private.save_local_quote_draft(p_clinic_id uuid,p_patient_id uuid,p_payload jsonb,p_request_key uuid,p_gate text,p_quote_id uuid,p_expected_version integer)
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
    if v_quantity>100 or exists(select 1 from jsonb_array_elements(v_lines) x where (x->>'service_id')::uuid=(v_line->>'service_id')::uuid) then raise exception using errcode='22023',message='invalid_quote_line'; end if;
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
create function private.quote_version_projection(p_clinic_id uuid,p_quote_id uuid,p_version integer)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',v.quote_id,'version',v.version,'state',v.state,'currency_code',v.currency_code,'total_minor',v.total_minor,
    'details',jsonb_build_object('subtotal_minor',v.subtotal_minor,'discount_minor',v.discount_minor,'tax_minor',v.tax_minor,'valid_until',v.valid_until,
      'lines',coalesce((select jsonb_agg(jsonb_build_object('line_number',l.line_number,'service_id',l.service_id,'price_version',l.price_version,'label',l.label_snapshot,'quantity',l.quantity,'unit_amount_minor',l.unit_amount_minor,'subtotal_minor',l.subtotal_minor,'discount_minor',l.discount_minor,'tax_minor',l.tax_minor,'total_minor',l.total_minor) order by l.line_number) from private.finance_quote_lines l where l.clinic_id=v.clinic_id and l.quote_id=v.quote_id and l.quote_version=v.version),'[]'::jsonb)))
  from private.finance_quote_versions v where v.clinic_id=p_clinic_id and v.quote_id=p_quote_id and v.version=p_version
$$;
revoke all on function private.quote_version_projection(uuid,uuid,integer) from public,anon,authenticated,service_role;
create or replace function public.read_patient_hub(p_clinic_id uuid,p_patient_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='unauthenticated'; end if;
  if not exists(select 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=auth.uid() and active and role in ('reception','manager','dentist')) then
    raise exception using errcode='42501',message='forbidden';
  end if;
  select jsonb_build_object(
    'patient',jsonb_build_object('id',p.id,'clinic_id',p.clinic_id,'reference',p.reference,'display_name',p.display_name),
    'profile',(select jsonb_build_object('phone_display',a.phone_display,'email',a.email,'city',a.city,'birth_date',a.birth_date,'preferred_language',a.preferred_language,'revision',a.revision) from private.patient_admin_profiles a where a.clinic_id=p.clinic_id and a.patient_id=p.id),
    'appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'starts_at',to_char(a.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'ends_at',to_char(a.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'status',a.status) order by a.starts_at)
      from private.demo_confirmed_appointments a where a.clinic_id=p.clinic_id and a.patient_id=p.id),'[]'::jsonb),
    'checklist',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'status',c.status,'revision',c.revision) order by c.kind) from private.patient_admin_document_checklist c where c.clinic_id=p.clinic_id and c.patient_id=p.id),'[]'::jsonb),
    'quotes',coalesce((select jsonb_agg(private.quote_version_projection(q.clinic_id,q.id,v.version)||jsonb_build_object('history',coalesce((select jsonb_agg(private.quote_version_projection(h.clinic_id,h.quote_id,h.version) order by h.version desc) from private.finance_quote_versions h where h.clinic_id=q.clinic_id and h.quote_id=q.id and h.version<v.version),'[]'::jsonb)) order by q.created_at)
      from private.finance_quotes q join private.finance_quote_versions v on v.clinic_id=q.clinic_id and v.quote_id=q.id
      where q.clinic_id=p.clinic_id and q.patient_id=p.id and v.version=(select max(v2.version) from private.finance_quote_versions v2 where v2.clinic_id=q.clinic_id and v2.quote_id=q.id)),'[]'::jsonb)
  ) into v_result from public.patients p where p.clinic_id=p_clinic_id and p.id=p_patient_id;
  if v_result is null then raise exception using errcode='PT404',message='patient_unavailable'; end if;
  return v_result;
end $$;
revoke all on function public.read_patient_hub(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_patient_hub(uuid,uuid) to authenticated;


commit;
