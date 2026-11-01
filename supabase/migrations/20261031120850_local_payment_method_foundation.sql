begin;
-- Receiving destinations are labels/identifiers only, never bank/card credentials.
create table private.finance_receiving_accounts(
  clinic_id uuid not null references public.clinics(id),id uuid not null default gen_random_uuid(),
  label text not null check(char_length(label) between 1 and 120),
  kind text not null check(kind in ('cash_drawer','bank','clearing')),active boolean not null default true,
  primary key(clinic_id,id)
);
create table private.finance_payment_methods(
  clinic_id uuid not null references public.clinics(id),id uuid not null default gen_random_uuid(),
  code text not null check(code ~ '^[A-Z0-9][A-Z0-9_-]{0,59}$'),
  primary key(clinic_id,id),unique(clinic_id,code)
);
create table private.finance_payment_method_versions(
  clinic_id uuid not null,method_id uuid not null,version integer not null check(version>0),
  code text not null check(code ~ '^[A-Z0-9][A-Z0-9_-]{0,59}$'),
  label text not null check(char_length(label) between 1 and 120),
  kind text not null check(kind in ('cash','card_terminal','bank_transfer','cheque','custom')),
  active boolean not null,reference_required boolean not null,
  settlement_behavior text not null check(settlement_behavior in ('at_confirmation','separate_verification')),
  receiving_account_id uuid not null,account_snapshot jsonb not null,
  created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,method_id,version),
  foreign key(clinic_id,method_id) references private.finance_payment_methods(clinic_id,id),
  foreign key(clinic_id,receiving_account_id) references private.finance_receiving_accounts(clinic_id,id)
);
create table private.finance_payment_method_commands(
  clinic_id uuid not null references public.clinics(id),actor_ref uuid not null references auth.users(id),request_key uuid not null,
  payload jsonb not null,receipt jsonb not null,created_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,actor_ref,request_key)
);
create index payment_method_account on private.finance_payment_method_versions(clinic_id,receiving_account_id);
alter table private.finance_receiving_accounts enable row level security;
alter table private.finance_payment_methods enable row level security;
alter table private.finance_payment_method_versions enable row level security;
alter table private.finance_payment_method_commands enable row level security;
revoke all on private.finance_receiving_accounts,private.finance_payment_methods,private.finance_payment_method_versions,private.finance_payment_method_commands from public,anon,authenticated,service_role;
create trigger payment_method_version_immutable before update or delete on private.finance_payment_method_versions for each row execute function private.reject_finance_snapshot_mutation();
create trigger payment_method_command_immutable before update or delete on private.finance_payment_method_commands for each row execute function private.reject_finance_snapshot_mutation();

create function public.save_local_payment_method(p_clinic_id uuid,p_payload jsonb,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_prior private.finance_payment_method_commands;v_method uuid;v_account private.finance_receiving_accounts;
  v_version integer;v_expected integer;v_receipt jsonb;v_snapshot jsonb;
begin
  v_actor:=private.authorize_local_quote_draft(p_clinic_id,p_gate);
  if p_request_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or not(p_payload ?& array['method_id','expected_version','code','label','kind','active','reference_required','settlement_behavior','receiving_account_id'])
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('method_id','expected_version','code','label','kind','active','reference_required','settlement_behavior','receiving_account_id')) then
    raise exception using errcode='22023',message='invalid_payment_method'; end if;
  if jsonb_typeof(p_payload->'method_id') not in ('null','string')
    or (jsonb_typeof(p_payload->'method_id')='string' and (p_payload->>'method_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or jsonb_typeof(p_payload->'expected_version')<>'number' or (p_payload->>'expected_version')!~'^(0|[1-9][0-9]{0,8})$'
    or jsonb_typeof(p_payload->'code')<>'string' or (p_payload->>'code')!~'^[A-Z0-9][A-Z0-9_-]{0,59}$'
    or jsonb_typeof(p_payload->'label')<>'string' or char_length(btrim(p_payload->>'label')) not between 1 and 120
    or jsonb_typeof(p_payload->'kind')<>'string' or (p_payload->>'kind') not in ('cash','card_terminal','bank_transfer','cheque','custom')
    or jsonb_typeof(p_payload->'active')<>'boolean' or jsonb_typeof(p_payload->'reference_required')<>'boolean'
    or jsonb_typeof(p_payload->'settlement_behavior')<>'string' or (p_payload->>'settlement_behavior') not in ('at_confirmation','separate_verification')
    or jsonb_typeof(p_payload->'receiving_account_id')<>'string' or (p_payload->>'receiving_account_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode='22023',message='invalid_payment_method'; end if;
  v_method:=(p_payload->>'method_id')::uuid;v_expected:=(p_payload->>'expected_version')::integer;
  if v_expected>=999999999 or (v_method is null and v_expected<>0) or (v_method is not null and v_expected<1) then raise exception using errcode='22023',message='invalid_payment_method_version'; end if;
  perform pg_advisory_xact_lock(hashtextextended('payment-method:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
  select * into v_prior from private.finance_payment_method_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.payload<>p_payload then raise exception using errcode='SH410',message='command_key_reused'; end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  select * into v_account from private.finance_receiving_accounts where clinic_id=p_clinic_id and id=(p_payload->>'receiving_account_id')::uuid and active for share;
  if not found then raise exception using errcode='PT404',message='receiving_account_unavailable'; end if;
  v_snapshot:=jsonb_build_object('id',v_account.id,'label',v_account.label,'kind',v_account.kind);
  if v_method is null then
    v_method:=gen_random_uuid();v_version:=1;
    insert into private.finance_payment_methods(clinic_id,id,code) values(p_clinic_id,v_method,p_payload->>'code');
  else
    perform 1 from private.finance_payment_methods where clinic_id=p_clinic_id and id=v_method for update;
    if not found then raise exception using errcode='PT404',message='payment_method_unavailable'; end if;
    select max(version) into v_version from private.finance_payment_method_versions where clinic_id=p_clinic_id and method_id=v_method;
    if v_version is distinct from v_expected then raise exception using errcode='SH409',message='payment_method_version_changed'; end if;
    v_version:=v_version+1;
    update private.finance_payment_methods set code=p_payload->>'code' where clinic_id=p_clinic_id and id=v_method;
  end if;
  insert into private.finance_payment_method_versions(clinic_id,method_id,version,code,label,kind,active,reference_required,settlement_behavior,receiving_account_id,account_snapshot,created_by)
    values(p_clinic_id,v_method,v_version,p_payload->>'code',btrim(p_payload->>'label'),p_payload->>'kind',(p_payload->>'active')::boolean,(p_payload->>'reference_required')::boolean,p_payload->>'settlement_behavior',v_account.id,v_snapshot,v_actor);
  v_receipt:=jsonb_build_object('method_id',v_method,'version',v_version,'code',p_payload->>'code','label',btrim(p_payload->>'label'),'kind',p_payload->>'kind','active',(p_payload->>'active')::boolean,
    'reference_required',(p_payload->>'reference_required')::boolean,'settlement_behavior',p_payload->>'settlement_behavior','receiving_account',v_snapshot,'synthetic_only',true,'replayed',false);
  insert into private.finance_payment_method_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,p_payload,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalPaymentMethodSaved',v_method,p_request_key);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'LocalPaymentMethodSaved',1,'finance_payment_method',v_method,p_request_key,v_actor,jsonb_build_object('version',v_version,'synthetic_only',true));
  return v_receipt;
exception when unique_violation then raise exception using errcode='SH409',message='payment_method_conflict';
end $$;
revoke all on function public.save_local_payment_method(uuid,jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.save_local_payment_method(uuid,jsonb,uuid,text) to authenticated;
commit;
