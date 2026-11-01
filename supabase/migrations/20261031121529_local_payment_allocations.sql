begin;
create table private.finance_payment_allocations(
  clinic_id uuid not null,id uuid not null default gen_random_uuid(),patient_id uuid not null,payment_id uuid not null,invoice_id uuid not null,
  amount_minor bigint not null check(amount_minor between 1 and 1000000000000),currency_code text not null check(currency_code='MAD'),
  actor_ref uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,id),foreign key(clinic_id,patient_id) references public.patients(clinic_id,id),
  foreign key(clinic_id,payment_id) references private.finance_payments(clinic_id,id),
  foreign key(clinic_id,invoice_id) references private.finance_issued_invoices(clinic_id,invoice_id)
);
create index payment_allocation_source on private.finance_payment_allocations(clinic_id,payment_id);
create index payment_allocation_invoice on private.finance_payment_allocations(clinic_id,invoice_id);
create index payment_allocation_patient on private.finance_payment_allocations(clinic_id,patient_id,created_at);
alter table private.finance_payment_allocations enable row level security;
revoke all on private.finance_payment_allocations from public,anon,authenticated,service_role;
create trigger payment_allocation_immutable before update or delete on private.finance_payment_allocations for each row execute function private.reject_finance_snapshot_mutation();

create function public.allocate_local_payment(p_clinic_id uuid,p_patient_id uuid,p_payment_id uuid,p_invoice_id uuid,p_amount_minor numeric,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_prior private.finance_payment_commands;v_payload jsonb;v_payment private.finance_payments;v_state private.finance_payment_events;
  v_invoice private.finance_invoice_drafts;v_payment_allocated bigint;v_invoice_allocated bigint;v_id uuid:=gen_random_uuid();v_receipt jsonb;v_amount bigint;
begin
  v_actor:=private.authorize_local_payment(p_clinic_id,p_gate);
  if p_patient_id is null or p_payment_id is null or p_invoice_id is null or p_request_key is null or p_amount_minor is null
    or p_amount_minor<1 or p_amount_minor>1000000000000 or trunc(p_amount_minor)<>p_amount_minor then raise exception using errcode='22023',message='invalid_allocation';end if;
  v_amount:=p_amount_minor::bigint;
  v_payload:=jsonb_build_object('action','allocate','patient_id',p_patient_id,'payment_id',p_payment_id,'invoice_id',p_invoice_id,'amount_minor',v_amount);
  perform pg_advisory_xact_lock(hashtextextended('payment:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
  select * into v_prior from private.finance_payment_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.payload<>v_payload then raise exception using errcode='SH410',message='command_key_reused';end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  -- All allocation writers lock source payment, then target invoice before summing.
  select * into v_payment from private.finance_payments where clinic_id=p_clinic_id and id=p_payment_id and patient_id=p_patient_id for update;
  if not found then raise exception using errcode='PT404',message='payment_unavailable';end if;
  select * into v_state from private.finance_payment_events where clinic_id=p_clinic_id and payment_id=p_payment_id order by version desc limit 1;
  -- Local synthetic rule: only verified settled funds may reduce invoice balances.
  if v_state.state is distinct from 'confirmed' or v_state.settlement is distinct from 'settled' then raise exception using errcode='SH409',message='payment_not_cleared';end if;
  select * into v_invoice from private.finance_invoice_drafts where clinic_id=p_clinic_id and id=p_invoice_id and patient_id=p_patient_id for update;
  if not found or not exists(select 1 from private.finance_issued_invoices where clinic_id=p_clinic_id and invoice_id=p_invoice_id) then raise exception using errcode='PT404',message='issued_invoice_unavailable';end if;
  if v_payment.currency_code<>v_invoice.currency_code then raise exception using errcode='22023',message='currency_mismatch';end if;
  select coalesce(sum(amount_minor),0) into v_payment_allocated from private.finance_payment_allocations where clinic_id=p_clinic_id and payment_id=p_payment_id;
  select coalesce(sum(amount_minor),0) into v_invoice_allocated from private.finance_payment_allocations where clinic_id=p_clinic_id and invoice_id=p_invoice_id;
  if v_amount>v_payment.amount_minor-v_payment_allocated or v_amount>v_invoice.total_minor-v_invoice_allocated then raise exception using errcode='SH409',message='allocation_exceeds_available_balance';end if;
  insert into private.finance_payment_allocations(clinic_id,id,patient_id,payment_id,invoice_id,amount_minor,currency_code,actor_ref)
    values(p_clinic_id,v_id,p_patient_id,p_payment_id,p_invoice_id,v_amount,v_payment.currency_code,v_actor);
  v_receipt:=jsonb_build_object('allocation_id',v_id,'patient_id',p_patient_id,'payment_id',p_payment_id,'invoice_id',p_invoice_id,'amount_minor',v_amount,'currency_code',v_payment.currency_code,
    'payment_unapplied_minor',v_payment.amount_minor-v_payment_allocated-v_amount,'invoice_remaining_minor',v_invoice.total_minor-v_invoice_allocated-v_amount,'synthetic_only',true,'replayed',false);
  insert into private.finance_payment_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,v_payload,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalPaymentAllocated',v_id,p_request_key);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'LocalPaymentAllocated',1,'finance_payment_allocation',v_id,p_request_key,v_actor,jsonb_build_object('synthetic_only',true));
  return v_receipt;
end $$;
revoke all on function public.allocate_local_payment(uuid,uuid,uuid,uuid,numeric,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.allocate_local_payment(uuid,uuid,uuid,uuid,numeric,uuid,text) to authenticated;
commit;
