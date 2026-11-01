begin;
alter table private.local_payment_settings add column receipt_series text not null default 'DEMO-R' check(receipt_series ~ '^DEMO-R(-[A-Z0-9]{1,16})?$');
create table private.finance_payment_receipt_counters(
  clinic_id uuid not null references public.clinics(id),series_code text not null,next_number bigint not null default 1 check(next_number between 1 and 999999999),primary key(clinic_id,series_code)
);
create table private.finance_payment_receipts(
  clinic_id uuid not null,id uuid not null default gen_random_uuid(),payment_id uuid not null,
  series_code text not null,sequence_number bigint not null check(sequence_number>0),number text not null,
  snapshot jsonb not null,issued_by uuid not null references auth.users(id),issued_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,id),unique(clinic_id,payment_id),unique(clinic_id,series_code,sequence_number),unique(clinic_id,number),
  foreign key(clinic_id,payment_id) references private.finance_payments(clinic_id,id)
);
alter table private.finance_payment_receipt_counters enable row level security;
alter table private.finance_payment_receipts enable row level security;
revoke all on private.finance_payment_receipt_counters,private.finance_payment_receipts from public,anon,authenticated,service_role;
create trigger payment_receipt_immutable before update or delete on private.finance_payment_receipts for each row execute function private.reject_finance_snapshot_mutation();
create function public.issue_local_payment_receipt(p_clinic_id uuid,p_patient_id uuid,p_payment_id uuid,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_prior private.finance_payment_commands;v_payload jsonb;v_payment private.finance_payments;v_state private.finance_payment_events;
  v_id uuid:=gen_random_uuid();v_series text;v_sequence bigint;v_snapshot jsonb;v_allocations jsonb;v_allocated bigint;v_clinic jsonb;v_receipt jsonb;v_issued timestamptz:=clock_timestamp();
begin
  v_actor:=private.authorize_local_payment(p_clinic_id,p_gate);
  if p_patient_id is null or p_payment_id is null or p_request_key is null then raise exception using errcode='22023',message='invalid_payment_receipt';end if;
  v_payload:=jsonb_build_object('action','issue_receipt','patient_id',p_patient_id,'payment_id',p_payment_id);
  perform pg_advisory_xact_lock(hashtextextended('payment:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
  select * into v_prior from private.finance_payment_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.payload<>v_payload then raise exception using errcode='SH410',message='command_key_reused';end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  select * into v_payment from private.finance_payments where clinic_id=p_clinic_id and id=p_payment_id and patient_id=p_patient_id for update;
  if not found then raise exception using errcode='PT404',message='payment_unavailable';end if;
  select * into v_state from private.finance_payment_events where clinic_id=p_clinic_id and payment_id=p_payment_id order by version desc limit 1;
  if v_state.state is distinct from 'confirmed' or v_state.settlement='failed' then raise exception using errcode='SH409',message='payment_receipt_unavailable';end if;
  if exists(select 1 from private.finance_payment_receipts where clinic_id=p_clinic_id and payment_id=p_payment_id) then raise exception using errcode='SH409',message='payment_receipt_already_issued';end if;
  select coalesce(jsonb_agg(jsonb_build_object('allocation_id',a.id,'invoice_id',a.invoice_id,'invoice_number',i.number,'amount_minor',a.amount_minor) order by a.created_at,a.id),'[]'::jsonb),coalesce(sum(a.amount_minor),0)
    into v_allocations,v_allocated from private.finance_payment_allocations a join private.finance_issued_invoices i on i.clinic_id=a.clinic_id and i.invoice_id=a.invoice_id
    where a.clinic_id=p_clinic_id and a.payment_id=p_payment_id;
  if v_allocated>v_payment.amount_minor then raise exception using errcode='SH409',message='payment_allocation_inconsistent';end if;
  select jsonb_build_object('id',id,'name',name) into v_clinic from public.clinics where id=p_clinic_id for share;
  select receipt_series into v_series from private.local_payment_settings where clinic_id=p_clinic_id;
  insert into private.finance_payment_receipt_counters(clinic_id,series_code) values(p_clinic_id,v_series) on conflict do nothing;
  update private.finance_payment_receipt_counters set next_number=next_number+1 where clinic_id=p_clinic_id and series_code=v_series returning next_number-1 into v_sequence;
  v_snapshot:=jsonb_build_object('schema_version',1,'synthetic_only',true,'clinic',v_clinic,'payment_id',p_payment_id,'patient_id',p_patient_id,
    'payer',v_payment.snapshot->'payer','payer_basis',v_payment.snapshot->>'payer_basis','method',v_payment.snapshot->'method',
    'amount_minor',v_payment.amount_minor,'currency_code',v_payment.currency_code,'reference',v_payment.reference,
    'effective_at',to_char(v_payment.effective_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'payment_version',v_state.version,'state',v_state.state,'settlement',v_state.settlement,
    'allocations',v_allocations,'allocated_minor',v_allocated,'unapplied_minor',v_payment.amount_minor-v_allocated,
    'disclaimer','LOCAL SYNTHETIC RECEIPT - NOT A STATUTORY DOCUMENT');
  insert into private.finance_payment_receipts(clinic_id,id,payment_id,series_code,sequence_number,number,snapshot,issued_by,issued_at)
    values(p_clinic_id,v_id,p_payment_id,v_series,v_sequence,v_series||'-'||v_sequence::text,v_snapshot,v_actor,v_issued);
  v_receipt:=jsonb_build_object('receipt_id',v_id,'payment_id',p_payment_id,'patient_id',p_patient_id,'number',v_series||'-'||v_sequence::text,
    'issued_at',to_char(v_issued at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'amount_minor',v_payment.amount_minor,'currency_code',v_payment.currency_code,'synthetic_only',true,'replayed',false);
  insert into private.finance_payment_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,v_payload,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalPaymentReceiptIssued',v_id,p_request_key);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'LocalPaymentReceiptIssued',1,'finance_payment_receipt',v_id,p_request_key,v_actor,jsonb_build_object('synthetic_only',true));
  return v_receipt;
end $$;
revoke all on function public.issue_local_payment_receipt(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.issue_local_payment_receipt(uuid,uuid,uuid,uuid,text) to authenticated;
commit;
