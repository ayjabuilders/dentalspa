begin;
-- Refund-aware current balances; original rows and issued receipts remain immutable.
create or replace function public.allocate_local_payment(p_clinic_id uuid,p_patient_id uuid,p_payment_id uuid,p_invoice_id uuid,p_amount_minor numeric,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_prior private.finance_payment_commands;v_payload jsonb;v_payment private.finance_payments;v_state private.finance_payment_events;
  v_invoice private.finance_invoice_drafts;v_payment_allocated bigint;v_invoice_allocated bigint;v_id uuid:=gen_random_uuid();v_receipt jsonb;v_amount bigint;v_refunded bigint;
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
  select coalesce(sum(amount_minor),0) into v_refunded from private.finance_payment_refunds where clinic_id=p_clinic_id and payment_id=p_payment_id;
  select coalesce(sum(a.amount_minor-coalesce(r.total,0)),0) into v_payment_allocated from private.finance_payment_allocations a cross join lateral(select sum(amount_minor) total from private.finance_allocation_releases where clinic_id=p_clinic_id and allocation_id=a.id) r where a.clinic_id=p_clinic_id and a.payment_id=p_payment_id;
  select coalesce(sum(a.amount_minor-coalesce(r.total,0)),0) into v_invoice_allocated from private.finance_payment_allocations a cross join lateral(select sum(amount_minor) total from private.finance_allocation_releases where clinic_id=p_clinic_id and allocation_id=a.id) r where a.clinic_id=p_clinic_id and a.invoice_id=p_invoice_id;
  if v_amount>v_payment.amount_minor-v_refunded-v_payment_allocated or v_amount>v_invoice.total_minor-v_invoice_allocated then raise exception using errcode='SH409',message='allocation_exceeds_available_balance';end if;
  insert into private.finance_payment_allocations(clinic_id,id,patient_id,payment_id,invoice_id,amount_minor,currency_code,actor_ref)
    values(p_clinic_id,v_id,p_patient_id,p_payment_id,p_invoice_id,v_amount,v_payment.currency_code,v_actor);
  v_receipt:=jsonb_build_object('allocation_id',v_id,'patient_id',p_patient_id,'payment_id',p_payment_id,'invoice_id',p_invoice_id,'amount_minor',v_amount,'currency_code',v_payment.currency_code,
    'payment_unapplied_minor',v_payment.amount_minor-v_refunded-v_payment_allocated-v_amount,'invoice_remaining_minor',v_invoice.total_minor-v_invoice_allocated-v_amount,'synthetic_only',true,'replayed',false);
  insert into private.finance_payment_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,v_payload,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalPaymentAllocated',v_id,p_request_key);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'LocalPaymentAllocated',1,'finance_payment_allocation',v_id,p_request_key,v_actor,jsonb_build_object('synthetic_only',true));
  return v_receipt;
end $$;
create or replace function public.read_local_patient_payments(p_clinic_id uuid,p_patient_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform private.authorize_local_quote_draft(p_clinic_id,p_gate);
  if not exists(select 1 from public.patients where clinic_id=p_clinic_id and id=p_patient_id) then raise exception using errcode='PT404',message='patient_unavailable';end if;
  -- All current balances and states are evaluated in the same statement snapshot.
  with allocations as materialized (select a.id,a.payment_id,a.invoice_id,a.created_at,a.amount_minor-coalesce(r.total,0) amount_minor from private.finance_payment_allocations a cross join lateral(select sum(amount_minor) total from private.finance_allocation_releases where clinic_id=p_clinic_id and allocation_id=a.id) r where a.clinic_id=p_clinic_id and a.patient_id=p_patient_id),
  payments as materialized (select * from private.finance_payments where clinic_id=p_clinic_id and patient_id=p_patient_id order by created_at desc,id limit 51),
  invoices as materialized (select d.*,i.number from private.finance_invoice_drafts d join private.finance_issued_invoices i on i.clinic_id=d.clinic_id and i.invoice_id=d.id where d.clinic_id=p_clinic_id and d.patient_id=p_patient_id order by d.created_at desc,d.id limit 51),
  latest_methods as (select distinct on(method_id) * from private.finance_payment_method_versions where clinic_id=p_clinic_id order by method_id,version desc),
  methods as materialized (select m.* from latest_methods m join private.finance_receiving_accounts a on a.clinic_id=m.clinic_id and a.id=m.receiving_account_id where m.active and a.active order by m.label,m.method_id limit 101)
  select jsonb_build_object('clinic_id',p_clinic_id,'patient_id',p_patient_id,'synthetic_only',true,
    'payments_truncated',(select count(*)>50 from payments),'invoices_truncated',(select count(*)>50 from invoices),'methods_truncated',(select count(*)>100 from methods),
    'payments',coalesce((select jsonb_agg(jsonb_build_object(
      'payment_id',p.id,'patient_id',p.patient_id,'version',s.version,'state',s.state,'settlement',s.settlement,
      'amount_minor',p.amount_minor,'currency_code',p.currency_code,'reference',p.reference,
      'effective_at',to_char(p.effective_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'created_at',to_char(p.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'method',p.snapshot->'method','payer',p.snapshot->'payer','payer_basis',p.snapshot->>'payer_basis',
      'refunded_minor',f.total,'allocated_minor',a.total,'unallocated_minor',p.amount_minor-f.total-a.total,
      'available_minor',case when s.state='confirmed' and s.settlement='settled' then p.amount_minor-f.total-a.total else 0 end,
      'receipt',case when r.id is null then null else jsonb_build_object('receipt_id',r.id,'number',r.number,'issued_at',to_char(r.issued_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) end
    ) order by p.created_at desc,p.id) from (select * from payments order by created_at desc,id limit 50) p
    cross join lateral(select * from private.finance_payment_events where clinic_id=p_clinic_id and payment_id=p.id order by version desc limit 1) s
    cross join lateral(select coalesce(sum(amount_minor),0) total from allocations where payment_id=p.id) a
    cross join lateral(select coalesce(sum(amount_minor),0) total from private.finance_payment_refunds where clinic_id=p_clinic_id and payment_id=p.id) f
    left join private.finance_payment_receipts r on r.clinic_id=p_clinic_id and r.payment_id=p.id),'[]'::jsonb),
    'invoices',coalesce((select jsonb_agg(jsonb_build_object('invoice_id',i.id,'patient_id',i.patient_id,'number',i.number,'total_minor',i.total_minor,'currency_code',i.currency_code,'allocated_minor',a.total,'remaining_minor',i.total_minor-a.total) order by i.created_at desc,i.id)
      from (select * from invoices order by created_at desc,id limit 50)i cross join lateral(select coalesce(sum(amount_minor),0) total from allocations where invoice_id=i.id)a),'[]'::jsonb),
    'methods',coalesce((select jsonb_agg(jsonb_build_object('id',m.method_id,'version',m.version,'code',m.code,'label',m.label,'kind',m.kind,'reference_required',m.reference_required,'settlement_behavior',m.settlement_behavior,'receiving_account',m.account_snapshot) order by m.label,m.method_id) from(select * from methods order by label,method_id limit 100)m),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
create or replace function public.issue_local_payment_receipt(p_clinic_id uuid,p_patient_id uuid,p_payment_id uuid,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_prior private.finance_payment_commands;v_payload jsonb;v_payment private.finance_payments;v_state private.finance_payment_events;
  v_id uuid:=gen_random_uuid();v_series text;v_sequence bigint;v_snapshot jsonb;v_allocations jsonb;v_allocated bigint;v_refunded bigint;v_clinic jsonb;v_receipt jsonb;v_issued timestamptz:=clock_timestamp();
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
  select coalesce(sum(amount_minor),0) into v_refunded from private.finance_payment_refunds where clinic_id=p_clinic_id and payment_id=p_payment_id;
  select coalesce(jsonb_agg(jsonb_build_object('allocation_id',a.id,'invoice_id',a.invoice_id,'invoice_number',i.number,'amount_minor',a.amount_minor-coalesce(r.total,0)) order by a.created_at,a.id),'[]'::jsonb),coalesce(sum(a.amount_minor-coalesce(r.total,0)),0)
    into v_allocations,v_allocated from private.finance_payment_allocations a join private.finance_issued_invoices i on i.clinic_id=a.clinic_id and i.invoice_id=a.invoice_id
    cross join lateral(select sum(amount_minor) total from private.finance_allocation_releases where clinic_id=p_clinic_id and allocation_id=a.id) r
    where a.clinic_id=p_clinic_id and a.payment_id=p_payment_id and a.amount_minor-coalesce(r.total,0)>0;
  if v_refunded+v_allocated>v_payment.amount_minor then raise exception using errcode='SH409',message='payment_allocation_inconsistent';end if;
  select jsonb_build_object('id',id,'name',name) into v_clinic from public.clinics where id=p_clinic_id for share;
  select receipt_series into v_series from private.local_payment_settings where clinic_id=p_clinic_id;
  insert into private.finance_payment_receipt_counters(clinic_id,series_code) values(p_clinic_id,v_series) on conflict do nothing;
  update private.finance_payment_receipt_counters set next_number=next_number+1 where clinic_id=p_clinic_id and series_code=v_series returning next_number-1 into v_sequence;
  v_snapshot:=jsonb_build_object('schema_version',2,'synthetic_only',true,'clinic',v_clinic,'payment_id',p_payment_id,'patient_id',p_patient_id,
    'payer',v_payment.snapshot->'payer','payer_basis',v_payment.snapshot->>'payer_basis','method',v_payment.snapshot->'method',
    'amount_minor',v_payment.amount_minor,'currency_code',v_payment.currency_code,'reference',v_payment.reference,
    'effective_at',to_char(v_payment.effective_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'payment_version',v_state.version,'state',v_state.state,'settlement',v_state.settlement,
    'allocations',v_allocations,'allocated_minor',v_allocated,'refunded_minor',v_refunded,'unapplied_minor',v_payment.amount_minor-v_refunded-v_allocated,
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
commit;
