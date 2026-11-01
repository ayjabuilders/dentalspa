begin;
-- Dedicated capabilities are deliberately empty; manager membership alone does not grant refunds.
create table private.local_finance_correction_permissions(
 clinic_id uuid not null references public.clinics(id),actor_ref uuid not null references auth.users(id),
 refund_allowed boolean not null default false,credit_allowed boolean not null default false,
 primary key(clinic_id,actor_ref)
);
create table private.finance_payment_refunds(
 clinic_id uuid not null,id uuid not null default gen_random_uuid(),patient_id uuid not null,payment_id uuid not null,
 kind text not null check(kind in ('refund','reversal')),amount_minor bigint not null check(amount_minor between 1 and 1000000000000),currency_code text not null check(currency_code='MAD'),
 reason text not null check(char_length(btrim(reason)) between 1 and 240),reference text not null check(reference ~ '^DEMO-[A-Z0-9-]{1,60}$'),
 effective_at timestamptz not null,verified boolean not null check(verified),snapshot jsonb not null,actor_ref uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 primary key(clinic_id,id),foreign key(clinic_id,patient_id) references public.patients(clinic_id,id),foreign key(clinic_id,payment_id) references private.finance_payments(clinic_id,id)
);
create table private.finance_allocation_releases(
 clinic_id uuid not null,refund_id uuid not null,allocation_id uuid not null,amount_minor bigint not null check(amount_minor between 1 and 1000000000000),
 primary key(clinic_id,refund_id,allocation_id),foreign key(clinic_id,refund_id) references private.finance_payment_refunds(clinic_id,id),foreign key(clinic_id,allocation_id) references private.finance_payment_allocations(clinic_id,id)
);
create index payment_refund_source on private.finance_payment_refunds(clinic_id,payment_id);
create index payment_refund_patient on private.finance_payment_refunds(clinic_id,patient_id,created_at);
create index allocation_release_source on private.finance_allocation_releases(clinic_id,allocation_id);
alter table private.local_finance_correction_permissions enable row level security;
alter table private.finance_payment_refunds enable row level security;
alter table private.finance_allocation_releases enable row level security;
revoke all on private.local_finance_correction_permissions,private.finance_payment_refunds,private.finance_allocation_releases from public,anon,authenticated,service_role;
create trigger payment_refund_immutable before update or delete on private.finance_payment_refunds for each row execute function private.reject_finance_snapshot_mutation();
create trigger allocation_release_immutable before update or delete on private.finance_allocation_releases for each row execute function private.reject_finance_snapshot_mutation();

create function public.record_local_payment_refund(p_clinic_id uuid,p_patient_id uuid,p_payment_id uuid,p_payload jsonb,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_permission boolean;v_prior private.finance_payment_commands;v_command jsonb;v_payment private.finance_payments;v_state private.finance_payment_events;
 v_amount bigint;v_refunded bigint;v_allocated bigint;v_released bigint;v_requested_release bigint:=0;v_item jsonb;v_allocation private.finance_payment_allocations;v_used bigint;v_id uuid:=gen_random_uuid();v_receipt jsonb;v_effective timestamptz;
begin
 v_actor:=private.authorize_local_payment(p_clinic_id,p_gate);
 select refund_allowed into v_permission from private.local_finance_correction_permissions where clinic_id=p_clinic_id and actor_ref=v_actor for share;
 if v_permission is distinct from true then raise exception using errcode='42501',message='refund_permission_required';end if;
 if p_patient_id is null or p_payment_id is null or p_request_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
 or not(p_payload ?& array['kind','amount_minor','reason','reference','effective_at','verified','releases'])
 or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('kind','amount_minor','reason','reference','effective_at','verified','releases')) then raise exception using errcode='22023',message='invalid_refund';end if;
 if jsonb_typeof(p_payload->'kind')<>'string' or (p_payload->>'kind') not in ('refund','reversal')
 or jsonb_typeof(p_payload->'amount_minor')<>'number' or (p_payload->>'amount_minor')!~'^[1-9][0-9]{0,12}$'
 or (p_payload->>'amount_minor')::numeric>1000000000000
 or jsonb_typeof(p_payload->'reason')<>'string' or char_length(btrim(p_payload->>'reason')) not between 1 and 240
 or jsonb_typeof(p_payload->'reference')<>'string' or (p_payload->>'reference')!~'^DEMO-[A-Z0-9-]{1,60}$'
 or p_payload->'verified'<>'true'::jsonb or jsonb_typeof(p_payload->'effective_at')<>'string'
 or (p_payload->>'effective_at')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$'
 or jsonb_typeof(p_payload->'releases')<>'array' then raise exception using errcode='22023',message='invalid_refund';end if;
 if jsonb_array_length(p_payload->'releases')>100 then raise exception using errcode='22023',message='too_many_releases';end if;
 begin v_effective:=(p_payload->>'effective_at')::timestamptz;exception when others then raise exception using errcode='22023',message='invalid_refund_date';end;
 if not isfinite(v_effective) or v_effective>clock_timestamp()+interval '5 minutes' then raise exception using errcode='22023',message='invalid_refund_date';end if;
 for v_item in select value from jsonb_array_elements(p_payload->'releases') loop
  if jsonb_typeof(v_item)<>'object' or not(v_item ?& array['allocation_id','amount_minor']) or exists(select 1 from jsonb_object_keys(v_item) k where k not in ('allocation_id','amount_minor'))
  or jsonb_typeof(v_item->'allocation_id')<>'string' or (v_item->>'allocation_id')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or jsonb_typeof(v_item->'amount_minor')<>'number' or (v_item->>'amount_minor')!~'^[1-9][0-9]{0,12}$' or (v_item->>'amount_minor')::numeric>1000000000000 then raise exception using errcode='22023',message='invalid_refund_release';end if;
  v_requested_release:=v_requested_release+(v_item->>'amount_minor')::bigint;
 end loop;
 if (select count(*)<>count(distinct (value->>'allocation_id')::uuid) from jsonb_array_elements(p_payload->'releases')) then raise exception using errcode='22023',message='duplicate_refund_release';end if;
 v_amount:=(p_payload->>'amount_minor')::bigint;
 if v_requested_release>v_amount then raise exception using errcode='22023',message='release_exceeds_refund';end if;
 v_command:=jsonb_build_object('action','refund','patient_id',p_patient_id,'payment_id',p_payment_id,'payload',p_payload);
 perform pg_advisory_xact_lock(hashtextextended('payment:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
 select * into v_prior from private.finance_payment_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
 if found then if v_prior.payload<>v_command then raise exception using errcode='SH410',message='command_key_reused';end if;return v_prior.receipt||jsonb_build_object('replayed',true);end if;
 select * into v_payment from private.finance_payments where clinic_id=p_clinic_id and id=p_payment_id and patient_id=p_patient_id for update;
 if not found then raise exception using errcode='PT404',message='payment_unavailable';end if;
 select * into v_state from private.finance_payment_events where clinic_id=p_clinic_id and payment_id=p_payment_id order by version desc limit 1;
 if v_state.state is distinct from 'confirmed' or v_state.settlement is distinct from 'settled' then raise exception using errcode='SH409',message='payment_not_cleared';end if;
 if v_effective<v_payment.effective_at then raise exception using errcode='22023',message='refund_before_payment';end if;
 select coalesce(sum(amount_minor),0) into v_refunded from private.finance_payment_refunds where clinic_id=p_clinic_id and payment_id=p_payment_id;
 select coalesce(sum(amount_minor),0) into v_allocated from private.finance_payment_allocations where clinic_id=p_clinic_id and payment_id=p_payment_id;
 select coalesce(sum(r.amount_minor),0) into v_released from private.finance_allocation_releases r join private.finance_payment_allocations a on a.clinic_id=r.clinic_id and a.id=r.allocation_id where a.clinic_id=p_clinic_id and a.payment_id=p_payment_id;
 if v_amount>v_payment.amount_minor-v_refunded or v_amount-v_requested_release>v_payment.amount_minor-v_refunded-v_allocated+v_released then raise exception using errcode='SH409',message='refund_exceeds_available_balance';end if;
 -- Same lock order as allocations: source payment, then invoices sorted by UUID.
 perform 1 from private.finance_invoice_drafts d where d.clinic_id=p_clinic_id and d.id in (select a.invoice_id from private.finance_payment_allocations a join jsonb_array_elements(p_payload->'releases') x on a.id=(x.value->>'allocation_id')::uuid where a.clinic_id=p_clinic_id and a.payment_id=p_payment_id) order by d.id for update;
 for v_item in select value from jsonb_array_elements(p_payload->'releases') loop
  select * into v_allocation from private.finance_payment_allocations where clinic_id=p_clinic_id and id=(v_item->>'allocation_id')::uuid and payment_id=p_payment_id and patient_id=p_patient_id;
  if not found then raise exception using errcode='PT404',message='allocation_unavailable';end if;
  select coalesce(sum(amount_minor),0) into v_used from private.finance_allocation_releases where clinic_id=p_clinic_id and allocation_id=v_allocation.id;
  if (v_item->>'amount_minor')::bigint>v_allocation.amount_minor-v_used then raise exception using errcode='SH409',message='release_exceeds_allocation';end if;
 end loop;
 insert into private.finance_payment_refunds(clinic_id,id,patient_id,payment_id,kind,amount_minor,currency_code,reason,reference,effective_at,verified,snapshot,actor_ref)
 values(p_clinic_id,v_id,p_patient_id,p_payment_id,p_payload->>'kind',v_amount,v_payment.currency_code,btrim(p_payload->>'reason'),p_payload->>'reference',v_effective,true,jsonb_build_object('synthetic_only',true,'payment',v_payment.snapshot,'original_amount_minor',v_payment.amount_minor,'prior_refunded_minor',v_refunded,'releases',p_payload->'releases'),v_actor);
 insert into private.finance_allocation_releases(clinic_id,refund_id,allocation_id,amount_minor) select p_clinic_id,v_id,(value->>'allocation_id')::uuid,(value->>'amount_minor')::bigint from jsonb_array_elements(p_payload->'releases');
 v_receipt:=jsonb_build_object('refund_id',v_id,'patient_id',p_patient_id,'payment_id',p_payment_id,'kind',p_payload->>'kind','amount_minor',v_amount,'currency_code',v_payment.currency_code,'refunded_minor',v_refunded+v_amount,'net_paid_minor',v_payment.amount_minor-v_refunded-v_amount,'released_minor',v_requested_release,'synthetic_only',true,'replayed',false);
 insert into private.finance_payment_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,v_command,v_receipt);
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalPaymentRefundVerified',v_id,p_request_key);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'LocalPaymentRefundVerified',1,'finance_payment_refund',v_id,p_request_key,v_actor,jsonb_build_object('synthetic_only',true));
 return v_receipt;
end $$;
revoke all on function public.record_local_payment_refund(uuid,uuid,uuid,jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.record_local_payment_refund(uuid,uuid,uuid,jsonb,uuid,text) to authenticated;
commit;
