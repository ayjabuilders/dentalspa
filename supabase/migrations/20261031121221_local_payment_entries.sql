begin;
create table private.local_payment_settings(
  clinic_id uuid primary key references public.clinics(id),enabled boolean not null default false,
  synthetic_only boolean not null default true check(synthetic_only)
);
create table private.finance_payments(
  clinic_id uuid not null,id uuid not null default gen_random_uuid(),patient_id uuid not null,
  method_id uuid not null,method_version integer not null,amount_minor bigint not null check(amount_minor between 1 and 1000000000000),
  currency_code text not null check(currency_code='MAD'),effective_at timestamptz not null,
  reference text check(reference ~ '^DEMO-[A-Z0-9-]{1,60}$'),snapshot jsonb not null,
  collected_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,id),foreign key(clinic_id,patient_id) references public.patients(clinic_id,id),
  foreign key(clinic_id,method_id,method_version) references private.finance_payment_method_versions(clinic_id,method_id,version)
);
create index payment_patient on private.finance_payments(clinic_id,patient_id,created_at desc);
create index payment_method on private.finance_payments(clinic_id,method_id,method_version);
create table private.finance_payment_events(
  clinic_id uuid not null,payment_id uuid not null,version integer not null check(version>0),
  action text not null check(action in ('record','confirm','fail','settle','settlement_failed')),
  state text not null check(state in ('pending','confirmed','failed')),
  settlement text not null check(settlement in ('pending','settled','failed')),
  actor_ref uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,payment_id,version),foreign key(clinic_id,payment_id) references private.finance_payments(clinic_id,id),
  check(state='confirmed' or settlement='pending'),check(action<>'record' or (version=1 and state='pending' and settlement='pending'))
);
create table private.finance_payment_commands(
  clinic_id uuid not null references public.clinics(id),actor_ref uuid not null references auth.users(id),request_key uuid not null,
  payload jsonb not null,receipt jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(clinic_id,actor_ref,request_key)
);
alter table private.local_payment_settings enable row level security;
alter table private.finance_payments enable row level security;
alter table private.finance_payment_events enable row level security;
alter table private.finance_payment_commands enable row level security;
revoke all on private.local_payment_settings,private.finance_payments,private.finance_payment_events,private.finance_payment_commands from public,anon,authenticated,service_role;
create trigger payment_immutable before update or delete on private.finance_payments for each row execute function private.reject_finance_snapshot_mutation();
create trigger payment_event_immutable before update or delete on private.finance_payment_events for each row execute function private.reject_finance_snapshot_mutation();
create trigger payment_command_immutable before update or delete on private.finance_payment_commands for each row execute function private.reject_finance_snapshot_mutation();
create function private.authorize_local_payment(p_clinic_id uuid,p_gate text) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_actor uuid;
begin
  v_actor:=private.authorize_local_quote_draft(p_clinic_id,p_gate);
  perform 1 from private.local_payment_settings where clinic_id=p_clinic_id and enabled and synthetic_only for share;
  if not found then raise exception using errcode='PT503',message='local_payments_disabled'; end if;
  return v_actor;
end $$;
revoke all on function private.authorize_local_payment(uuid,text) from public,anon,authenticated,service_role;

create function public.record_local_payment(p_clinic_id uuid,p_patient_id uuid,p_payload jsonb,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_prior private.finance_payment_commands;v_payload jsonb;v_method private.finance_payment_method_versions;v_current integer;
  v_id uuid:=gen_random_uuid();v_effective timestamptz;v_amount bigint;v_payer jsonb;v_snapshot jsonb;v_receipt jsonb;v_reference text;
begin
  v_actor:=private.authorize_local_payment(p_clinic_id,p_gate);
  if p_patient_id is null or p_request_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or not(p_payload ?& array['method_id','method_version','amount_minor','currency_code','effective_at','reference'])
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('method_id','method_version','amount_minor','currency_code','effective_at','reference')) then raise exception using errcode='22023',message='invalid_payment'; end if;
  if jsonb_typeof(p_payload->'method_id')<>'string' or (p_payload->>'method_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_payload->'method_version')<>'number' or (p_payload->>'method_version')!~'^[1-9][0-9]{0,8}$'
    or jsonb_typeof(p_payload->'amount_minor')<>'number' or (p_payload->>'amount_minor')!~'^[1-9][0-9]{0,12}$'
    or jsonb_typeof(p_payload->'currency_code')<>'string' or p_payload->>'currency_code'<>'MAD'
    or jsonb_typeof(p_payload->'effective_at')<>'string' or (p_payload->>'effective_at')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$'
    or jsonb_typeof(p_payload->'reference') not in ('null','string')
    or (jsonb_typeof(p_payload->'reference')='string' and (p_payload->>'reference')!~'^DEMO-[A-Z0-9-]{1,60}$') then raise exception using errcode='22023',message='invalid_payment'; end if;
  begin v_effective:=(p_payload->>'effective_at')::timestamptz;exception when others then raise exception using errcode='22023',message='invalid_effective_time';end;
  v_amount:=(p_payload->>'amount_minor')::bigint;v_reference:=p_payload->>'reference';
  if v_amount>1000000000000 or v_effective>clock_timestamp()+interval '5 minutes' then raise exception using errcode='22023',message='invalid_payment'; end if;
  v_payload:=jsonb_build_object('action','record','patient_id',p_patient_id,'body',p_payload);
  perform pg_advisory_xact_lock(hashtextextended('payment:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
  select * into v_prior from private.finance_payment_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.payload<>v_payload then raise exception using errcode='SH410',message='command_key_reused'; end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  select jsonb_build_object('id',id,'reference',reference,'display_name',display_name) into v_payer from public.patients where clinic_id=p_clinic_id and id=p_patient_id for share;
  if not found then raise exception using errcode='PT404',message='patient_unavailable'; end if;
  perform 1 from private.finance_payment_methods where clinic_id=p_clinic_id and id=(p_payload->>'method_id')::uuid for share;
  if not found then raise exception using errcode='PT404',message='payment_method_unavailable'; end if;
  select max(version) into v_current from private.finance_payment_method_versions where clinic_id=p_clinic_id and method_id=(p_payload->>'method_id')::uuid;
  if v_current is distinct from (p_payload->>'method_version')::integer then raise exception using errcode='SH409',message='payment_method_changed'; end if;
  select * into v_method from private.finance_payment_method_versions where clinic_id=p_clinic_id and method_id=(p_payload->>'method_id')::uuid and version=v_current and active;
  if not found then raise exception using errcode='PT404',message='payment_method_unavailable'; end if;
  perform 1 from private.finance_receiving_accounts where clinic_id=p_clinic_id and id=v_method.receiving_account_id and active for share;
  if not found then raise exception using errcode='PT404',message='receiving_account_unavailable'; end if;
  if v_method.reference_required and v_reference is null then raise exception using errcode='22023',message='reference_required'; end if;
  v_snapshot:=jsonb_build_object('schema_version',1,'synthetic_only',true,'payer',v_payer,'payer_basis','patient_self_synthetic_fixture','method',
    jsonb_build_object('id',v_method.method_id,'version',v_method.version,'code',v_method.code,'label',v_method.label,'kind',v_method.kind,'reference_required',v_method.reference_required,'settlement_behavior',v_method.settlement_behavior,'receiving_account',v_method.account_snapshot));
  insert into private.finance_payments(clinic_id,id,patient_id,method_id,method_version,amount_minor,currency_code,effective_at,reference,snapshot,collected_by)
    values(p_clinic_id,v_id,p_patient_id,v_method.method_id,v_method.version,v_amount,'MAD',v_effective,v_reference,v_snapshot,v_actor);
  insert into private.finance_payment_events(clinic_id,payment_id,version,action,state,settlement,actor_ref) values(p_clinic_id,v_id,1,'record','pending','pending',v_actor);
  v_receipt:=jsonb_build_object('payment_id',v_id,'patient_id',p_patient_id,'version',1,'state','pending','settlement','pending','amount_minor',v_amount,'currency_code','MAD','synthetic_only',true,'replayed',false);
  insert into private.finance_payment_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,v_payload,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalPaymentRecorded',v_id,p_request_key);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'LocalPaymentRecorded',1,'finance_payment',v_id,p_request_key,v_actor,jsonb_build_object('version',1,'synthetic_only',true));
  return v_receipt;
end $$;

create function public.transition_local_payment(p_clinic_id uuid,p_patient_id uuid,p_payment_id uuid,p_expected_version integer,p_action text,p_verified boolean,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_prior private.finance_payment_commands;v_payload jsonb;v_payment private.finance_payments;v_state private.finance_payment_events;v_status text;v_settlement text;v_receipt jsonb;
begin
  v_actor:=private.authorize_local_payment(p_clinic_id,p_gate);
  if p_patient_id is null or p_payment_id is null or p_expected_version is null or p_expected_version<1 or p_expected_version>=999999999 or p_action is null or p_action not in ('confirm','fail','settle','settlement_failed') or p_verified is distinct from true or p_request_key is null then raise exception using errcode='22023',message='invalid_payment_transition'; end if;
  v_payload:=jsonb_build_object('action',p_action,'patient_id',p_patient_id,'payment_id',p_payment_id,'expected_version',p_expected_version,'verified',true);
  perform pg_advisory_xact_lock(hashtextextended('payment:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
  select * into v_prior from private.finance_payment_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.payload<>v_payload then raise exception using errcode='SH410',message='command_key_reused'; end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  select * into v_payment from private.finance_payments where clinic_id=p_clinic_id and id=p_payment_id and patient_id=p_patient_id for update;
  if not found then raise exception using errcode='PT404',message='payment_unavailable'; end if;
  select * into v_state from private.finance_payment_events where clinic_id=p_clinic_id and payment_id=p_payment_id order by version desc limit 1;
  if v_state.version is distinct from p_expected_version then raise exception using errcode='SH409',message='payment_version_changed'; end if;
  v_status:=v_state.state;v_settlement:=v_state.settlement;
  if p_action in ('confirm','fail') and v_state.state='pending' then
    v_status:=case when p_action='confirm' then 'confirmed' else 'failed' end;
    if p_action='confirm' and v_payment.snapshot->'method'->>'settlement_behavior'='at_confirmation' then v_settlement:='settled';end if;
  elsif p_action in ('settle','settlement_failed') and v_state.state='confirmed' and v_state.settlement='pending' then
    v_settlement:=case when p_action='settle' then 'settled' else 'failed' end;
  else raise exception using errcode='SH409',message='payment_transition_unavailable';end if;
  insert into private.finance_payment_events(clinic_id,payment_id,version,action,state,settlement,actor_ref) values(p_clinic_id,p_payment_id,p_expected_version+1,p_action,v_status,v_settlement,v_actor);
  v_receipt:=jsonb_build_object('payment_id',p_payment_id,'patient_id',p_patient_id,'version',p_expected_version+1,'state',v_status,'settlement',v_settlement,'amount_minor',v_payment.amount_minor,'currency_code',v_payment.currency_code,'synthetic_only',true,'replayed',false);
  insert into private.finance_payment_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,v_payload,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalPaymentStateRecorded',p_payment_id,p_request_key);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'LocalPaymentStateRecorded',1,'finance_payment',p_payment_id,p_request_key,v_actor,jsonb_build_object('version',p_expected_version+1,'synthetic_only',true));
  return v_receipt;
end $$;
revoke all on function public.record_local_payment(uuid,uuid,jsonb,uuid,text),public.transition_local_payment(uuid,uuid,uuid,integer,text,boolean,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.record_local_payment(uuid,uuid,jsonb,uuid,text),public.transition_local_payment(uuid,uuid,uuid,integer,text,boolean,uuid,text) to authenticated;
commit;
