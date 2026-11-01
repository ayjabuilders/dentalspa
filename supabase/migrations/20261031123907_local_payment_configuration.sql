begin;
alter table private.finance_receiving_accounts add column version integer not null default 1 check(version between 1 and 999999999);
create table private.finance_receiving_account_commands(
 clinic_id uuid not null references public.clinics(id),actor_ref uuid not null references auth.users(id),request_key uuid not null,
 payload jsonb not null,receipt jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(clinic_id,actor_ref,request_key)
);
alter table private.finance_receiving_account_commands enable row level security;
revoke all on private.finance_receiving_account_commands from public,anon,authenticated,service_role;
create trigger receiving_account_command_immutable before update or delete on private.finance_receiving_account_commands for each row execute function private.reject_finance_snapshot_mutation();
create function public.save_local_receiving_account(p_clinic_id uuid,p_payload jsonb,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_prior private.finance_receiving_account_commands;v_id uuid;v_expected integer;v_account private.finance_receiving_accounts;v_receipt jsonb;
begin
 v_actor:=private.authorize_local_quote_draft(p_clinic_id,p_gate);
 if p_request_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
 or not(p_payload ?& array['account_id','expected_version','label','kind','active'])
 or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('account_id','expected_version','label','kind','active')) then raise exception using errcode='22023',message='invalid_receiving_account';end if;
 if jsonb_typeof(p_payload->'account_id') not in ('null','string')
 or (jsonb_typeof(p_payload->'account_id')='string' and (p_payload->>'account_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
 or jsonb_typeof(p_payload->'expected_version')<>'number' or (p_payload->>'expected_version')!~'^(0|[1-9][0-9]{0,8})$'
 or jsonb_typeof(p_payload->'label')<>'string' or char_length(btrim(p_payload->>'label')) not between 1 and 120
 or jsonb_typeof(p_payload->'kind')<>'string' or (p_payload->>'kind') not in ('cash_drawer','bank','clearing')
 or jsonb_typeof(p_payload->'active')<>'boolean' then raise exception using errcode='22023',message='invalid_receiving_account';end if;
 v_id:=(p_payload->>'account_id')::uuid;v_expected:=(p_payload->>'expected_version')::integer;
 if v_expected>=999999999 or (v_id is null and v_expected<>0) or (v_id is not null and v_expected<1) then raise exception using errcode='22023',message='invalid_receiving_account_version';end if;
 perform pg_advisory_xact_lock(hashtextextended('receiving-account:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
 select * into v_prior from private.finance_receiving_account_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
 if found then
  if v_prior.payload<>p_payload then raise exception using errcode='SH410',message='command_key_reused';end if;
  return v_prior.receipt||jsonb_build_object('replayed',true);
 end if;
 if v_id is null then
  v_id:=gen_random_uuid();insert into private.finance_receiving_accounts(clinic_id,id,label,kind,active) values(p_clinic_id,v_id,btrim(p_payload->>'label'),p_payload->>'kind',(p_payload->>'active')::boolean) returning * into v_account;
 else
  select * into v_account from private.finance_receiving_accounts where clinic_id=p_clinic_id and id=v_id for update;
  if not found then raise exception using errcode='PT404',message='receiving_account_unavailable';end if;
  if v_account.version<>v_expected then raise exception using errcode='SH409',message='receiving_account_version_changed';end if;
  update private.finance_receiving_accounts set label=btrim(p_payload->>'label'),kind=p_payload->>'kind',active=(p_payload->>'active')::boolean,version=version+1 where clinic_id=p_clinic_id and id=v_id returning * into v_account;
 end if;
 v_receipt:=jsonb_build_object('account_id',v_id,'version',v_account.version,'label',v_account.label,'kind',v_account.kind,'active',v_account.active,'synthetic_only',true,'replayed',false);
 insert into private.finance_receiving_account_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,p_payload,v_receipt);
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalReceivingAccountSaved',v_id,p_request_key);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'LocalReceivingAccountSaved',1,'finance_receiving_account',v_id,p_request_key,v_actor,jsonb_build_object('version',v_account.version,'synthetic_only',true));
 return v_receipt;
end $$;
revoke all on function public.save_local_receiving_account(uuid,jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.save_local_receiving_account(uuid,jsonb,uuid,text) to authenticated;

-- A single statement reads current method definitions plus current destinations.
-- Method destination snapshots remain historical; destination_active signals usability.
create function public.read_local_payment_configuration(p_clinic_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform private.authorize_local_quote_draft(p_clinic_id,p_gate);
 with accounts as (select * from private.finance_receiving_accounts where clinic_id=p_clinic_id),
 latest as (select distinct on(method_id) * from private.finance_payment_method_versions where clinic_id=p_clinic_id order by method_id,version desc),
 limited_accounts as (select * from accounts order by label,id limit 100),
 limited_methods as (select * from latest order by label,method_id limit 100)
 select jsonb_build_object('clinic_id',p_clinic_id,'synthetic_only',true,
 'accounts_truncated',(select count(*)>100 from accounts),'methods_truncated',(select count(*)>100 from latest),
 'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',version,'label',label,'kind',kind,'active',active) order by label,id) from limited_accounts),'[]'::jsonb),
 'methods',coalesce((select jsonb_agg(jsonb_build_object('id',m.method_id,'version',m.version,'code',m.code,'label',m.label,'kind',m.kind,'active',m.active,'reference_required',m.reference_required,'settlement_behavior',m.settlement_behavior,'receiving_account',m.account_snapshot,'destination_active',a.active) order by m.label,m.method_id) from limited_methods m join accounts a on a.id=m.receiving_account_id),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
revoke all on function public.read_local_payment_configuration(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_local_payment_configuration(uuid,text) to authenticated;
commit;
