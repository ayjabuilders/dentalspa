begin;
-- Local synthetic drafting only. No clinic is enabled by this migration.
create table private.finance_draft_gates (
  clinic_id uuid primary key references public.clinics(id),
  enabled boolean not null default false,
  synthetic_only boolean not null default true check(synthetic_only),
  api_gate_key text not null default ''
);
create table private.finance_draft_commands (
  clinic_id uuid not null references public.clinics(id), actor_ref uuid not null references auth.users(id),
  request_key uuid not null, patient_id uuid not null, payload jsonb not null,
  receipt jsonb not null, created_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,actor_ref,request_key),
  foreign key(clinic_id,patient_id) references public.patients(clinic_id,id)
);
alter table private.finance_draft_gates enable row level security;
alter table private.finance_draft_commands enable row level security;
revoke all on private.finance_draft_gates,private.finance_draft_commands from public,anon,authenticated,service_role;
create trigger finance_draft_command_immutable before update or delete on private.finance_draft_commands
  for each row execute function private.reject_finance_snapshot_mutation();

create function private.authorize_local_quote_draft(p_clinic_id uuid,p_gate text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception using errcode='28000',message='unauthenticated'; end if;
  -- This role choice is a synthetic fixture, not an approved live finance policy.
  perform 1 from public.clinic_memberships where clinic_id=p_clinic_id and user_id=v_actor and active and role='manager' for share;
  if not found then raise exception using errcode='42501',message='forbidden'; end if;
  perform 1 from private.finance_draft_gates where clinic_id=p_clinic_id and enabled and synthetic_only and api_gate_key<>'' and api_gate_key=p_gate for share;
  if not found then raise exception using errcode='PT503',message='local_finance_disabled'; end if;
  return v_actor;
end $$;
revoke all on function private.authorize_local_quote_draft(uuid,text) from public,anon,authenticated,service_role;

create function public.read_local_quote_catalog(p_clinic_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform private.authorize_local_quote_draft(p_clinic_id,p_gate);
  select coalesce(jsonb_agg(jsonb_build_object('service_id',s.id,'label',s.service_name,'price_version',p.version,'unit_amount_minor',p.unit_amount_minor,'currency_code',p.currency_code) order by s.service_code),'[]'::jsonb)
  into v_result from private.finance_catalog_services s
  join lateral(select v.* from private.finance_catalog_price_versions v where v.clinic_id=s.clinic_id and v.service_id=s.id and v.effective_from<=clock_timestamp() order by v.version desc limit 1) p on true
  where s.clinic_id=p_clinic_id and s.archived_at is null and p.currency_code='MAD' and p.unit_amount_minor<=10000000000;
  return jsonb_build_object('items',v_result,'synthetic_only',true);
end $$;

create function public.create_local_quote_draft(p_clinic_id uuid,p_patient_id uuid,p_payload jsonb,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid; v_prior private.finance_draft_commands; v_quote uuid:=gen_random_uuid();
  v_line jsonb; v_service private.finance_catalog_services; v_price private.finance_catalog_price_versions;
  v_lines jsonb:='[]'; v_total bigint:=0; v_quantity integer; v_number integer:=0; v_receipt jsonb;
begin
  v_actor:=private.authorize_local_quote_draft(p_clinic_id,p_gate);
  if p_request_key is null or p_patient_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or p_payload-'lines'<>'{}'::jsonb or not(p_payload?'lines') or jsonb_typeof(p_payload->'lines')<>'array' then
    raise exception using errcode='22023',message='invalid_quote_command';
  end if;
  if jsonb_array_length(p_payload->'lines') not between 1 and 50 then raise exception using errcode='22023',message='invalid_quote_lines'; end if;
  perform pg_advisory_xact_lock(hashtextextended('quote-draft:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
  select * into v_prior from private.finance_draft_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.patient_id<>p_patient_id or v_prior.payload<>p_payload then raise exception using errcode='SH410',message='command_key_reused'; end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  perform 1 from public.patients where clinic_id=p_clinic_id and id=p_patient_id for share;
  if not found then raise exception using errcode='PT404',message='patient_unavailable'; end if;
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
  insert into private.finance_quotes(clinic_id,id,patient_id,created_by) values(p_clinic_id,v_quote,p_patient_id,v_actor);
  -- Tax/discount disabled in this local fixture. No exemption or approval is implied.
  insert into private.finance_quote_versions(clinic_id,quote_id,version,currency_code,subtotal_minor,discount_minor,tax_minor,created_by)
    values(p_clinic_id,v_quote,1,'MAD',v_total,0,0,v_actor);
  insert into private.finance_quote_lines(clinic_id,quote_id,quote_version,line_number,service_id,price_version,label_snapshot,quantity,unit_amount_minor,discount_minor,tax_minor)
    select p_clinic_id,v_quote,1,(x->>'line_number')::integer,(x->>'service_id')::uuid,(x->>'price_version')::integer,x->>'label',(x->>'quantity')::integer,(x->>'unit')::bigint,0,0 from jsonb_array_elements(v_lines) x;
  v_receipt:=jsonb_build_object('quote_id',v_quote,'patient_id',p_patient_id,'version',1,'state','draft','currency_code','MAD','total_minor',v_total,'replayed',false);
  insert into private.finance_draft_commands(clinic_id,actor_ref,request_key,patient_id,payload,receipt) values(p_clinic_id,v_actor,p_request_key,p_patient_id,p_payload,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalQuoteDraftCreated',v_quote,p_request_key);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload)
    values(p_clinic_id,'LocalQuoteDraftCreated',1,'finance_quote',v_quote,p_request_key,v_actor,jsonb_build_object('quote_version',1,'synthetic_only',true));
  return v_receipt;
end $$;
revoke all on function public.read_local_quote_catalog(uuid,text),public.create_local_quote_draft(uuid,uuid,jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_local_quote_catalog(uuid,text),public.create_local_quote_draft(uuid,uuid,jsonb,uuid,text) to authenticated;
commit;
