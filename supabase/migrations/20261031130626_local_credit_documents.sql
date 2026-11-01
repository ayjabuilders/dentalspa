begin;
alter table private.local_invoice_settings add column credit_series text not null default 'DEMO-C' check(credit_series ~ '^DEMO-C(-[A-Z0-9]{1,16})?$');
create table private.finance_credit_counters(clinic_id uuid not null references public.clinics(id),series_code text not null,next_number bigint not null default 1 check(next_number between 1 and 999999999),primary key(clinic_id,series_code));
create table private.finance_invoice_credits(
 clinic_id uuid not null,id uuid not null default gen_random_uuid(),patient_id uuid not null,invoice_id uuid not null,
 amount_minor bigint not null check(amount_minor between 1 and 1000000000000),currency_code text not null check(currency_code='MAD'),reason text not null check(char_length(btrim(reason)) between 1 and 240),
 series_code text not null,sequence_number bigint not null check(sequence_number>0),number text not null,snapshot jsonb not null,issued_by uuid not null references auth.users(id),issued_at timestamptz not null default clock_timestamp(),
 primary key(clinic_id,id),unique(clinic_id,series_code,sequence_number),unique(clinic_id,number),foreign key(clinic_id,patient_id) references public.patients(clinic_id,id),foreign key(clinic_id,invoice_id) references private.finance_issued_invoices(clinic_id,invoice_id)
);
create table private.finance_credit_commands(clinic_id uuid not null references public.clinics(id),actor_ref uuid not null references auth.users(id),request_key uuid not null,payload jsonb not null,receipt jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(clinic_id,actor_ref,request_key));
create index invoice_credit_source on private.finance_invoice_credits(clinic_id,invoice_id);
create index invoice_credit_patient on private.finance_invoice_credits(clinic_id,patient_id,issued_at);
alter table private.finance_credit_counters enable row level security;
alter table private.finance_invoice_credits enable row level security;
alter table private.finance_credit_commands enable row level security;
revoke all on private.finance_credit_counters,private.finance_invoice_credits,private.finance_credit_commands from public,anon,authenticated,service_role;
create trigger invoice_credit_immutable before update or delete on private.finance_invoice_credits for each row execute function private.reject_finance_snapshot_mutation();
create trigger credit_command_immutable before update or delete on private.finance_credit_commands for each row execute function private.reject_finance_snapshot_mutation();
create function public.post_local_invoice_credit(p_clinic_id uuid,p_patient_id uuid,p_invoice_id uuid,p_amount_minor numeric,p_reason text,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_permission boolean;v_series text;v_prior private.finance_credit_commands;v_payload jsonb;v_invoice private.finance_invoice_drafts;v_number text;
 v_credited bigint;v_allocated bigint;v_amount bigint;v_sequence bigint;v_id uuid:=gen_random_uuid();v_snapshot jsonb;v_receipt jsonb;v_issued timestamptz:=clock_timestamp();
begin
 v_actor:=private.authorize_local_quote_draft(p_clinic_id,p_gate);
 select credit_allowed into v_permission from private.local_finance_correction_permissions where clinic_id=p_clinic_id and actor_ref=v_actor for share;
 if v_permission is distinct from true then raise exception using errcode='42501',message='credit_permission_required';end if;
 select credit_series into v_series from private.local_invoice_settings where clinic_id=p_clinic_id and synthetic_only and issuance_enabled for share;
 if not found then raise exception using errcode='PT503',message='local_credit_unavailable';end if;
 if p_patient_id is null or p_invoice_id is null or p_request_key is null or p_amount_minor is null or p_amount_minor<1 or p_amount_minor>1000000000000 or trunc(p_amount_minor)<>p_amount_minor or p_reason is null or char_length(btrim(p_reason)) not between 1 and 240 then raise exception using errcode='22023',message='invalid_credit';end if;
 v_amount:=p_amount_minor::bigint;v_payload:=jsonb_build_object('patient_id',p_patient_id,'invoice_id',p_invoice_id,'amount_minor',v_amount,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended('invoice-credit:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
 select * into v_prior from private.finance_credit_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
 if found then if v_prior.payload<>v_payload then raise exception using errcode='SH410',message='command_key_reused';end if;return v_prior.receipt||jsonb_build_object('replayed',true);end if;
 select * into v_invoice from private.finance_invoice_drafts where clinic_id=p_clinic_id and patient_id=p_patient_id and id=p_invoice_id for update;
 if not found then raise exception using errcode='PT404',message='invoice_unavailable';end if;
 select number into v_number from private.finance_issued_invoices where clinic_id=p_clinic_id and invoice_id=p_invoice_id;
 if not found then raise exception using errcode='PT404',message='issued_invoice_unavailable';end if;
 select coalesce(sum(amount_minor),0) into v_credited from private.finance_invoice_credits where clinic_id=p_clinic_id and invoice_id=p_invoice_id;
 if v_amount>v_invoice.total_minor-v_credited then raise exception using errcode='SH409',message='credit_exceeds_invoice';end if;
 select coalesce(sum(a.amount_minor-coalesce(r.total,0)),0) into v_allocated from private.finance_payment_allocations a cross join lateral(select sum(amount_minor) total from private.finance_allocation_releases where clinic_id=p_clinic_id and allocation_id=a.id) r where a.clinic_id=p_clinic_id and a.invoice_id=p_invoice_id;
 insert into private.finance_credit_counters(clinic_id,series_code) values(p_clinic_id,v_series) on conflict do nothing;
 update private.finance_credit_counters set next_number=next_number+1 where clinic_id=p_clinic_id and series_code=v_series returning next_number-1 into v_sequence;
 v_snapshot:=jsonb_build_object('schema_version',1,'synthetic_only',true,'invoice_id',p_invoice_id,'invoice_number',v_number,'invoice_total_minor',v_invoice.total_minor,'invoice_snapshot',v_invoice.snapshot,'patient_id',p_patient_id,'amount_minor',v_amount,'currency_code',v_invoice.currency_code,'reason',btrim(p_reason),'prior_credited_minor',v_credited,'disclaimer','LOCAL SYNTHETIC CREDIT - NOT A STATUTORY DOCUMENT');
 insert into private.finance_invoice_credits(clinic_id,id,patient_id,invoice_id,amount_minor,currency_code,reason,series_code,sequence_number,number,snapshot,issued_by,issued_at)
 values(p_clinic_id,v_id,p_patient_id,p_invoice_id,v_amount,v_invoice.currency_code,btrim(p_reason),v_series,v_sequence,v_series||'-'||v_sequence::text,v_snapshot,v_actor,v_issued);
 v_receipt:=jsonb_build_object('credit_id',v_id,'patient_id',p_patient_id,'invoice_id',p_invoice_id,'number',v_series||'-'||v_sequence::text,'amount_minor',v_amount,'currency_code',v_invoice.currency_code,'credited_minor',v_credited+v_amount,'invoice_remaining_minor',greatest(0,v_invoice.total_minor-v_credited-v_amount-v_allocated),'invoice_overpaid_minor',greatest(0,v_allocated-v_invoice.total_minor+v_credited+v_amount),'issued_at',to_char(v_issued at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'synthetic_only',true,'replayed',false);
 insert into private.finance_credit_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,v_payload,v_receipt);
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalInvoiceCreditPosted',v_id,p_request_key);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'LocalInvoiceCreditPosted',1,'finance_invoice_credit',v_id,p_request_key,v_actor,jsonb_build_object('synthetic_only',true));
 return v_receipt;
end $$;
revoke all on function public.post_local_invoice_credit(uuid,uuid,uuid,numeric,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.post_local_invoice_credit(uuid,uuid,uuid,numeric,text,uuid,text) to authenticated;

create or replace function public.allocate_local_payment(p_clinic_id uuid,p_patient_id uuid,p_payment_id uuid,p_invoice_id uuid,p_amount_minor numeric,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_prior private.finance_payment_commands;v_payload jsonb;v_payment private.finance_payments;v_state private.finance_payment_events;
  v_invoice private.finance_invoice_drafts;v_payment_allocated bigint;v_invoice_allocated bigint;v_id uuid:=gen_random_uuid();v_receipt jsonb;v_amount bigint;v_refunded bigint;v_credited bigint;
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
  select coalesce(sum(amount_minor),0) into v_credited from private.finance_invoice_credits where clinic_id=p_clinic_id and invoice_id=p_invoice_id;
  if v_amount>v_payment.amount_minor-v_refunded-v_payment_allocated or v_amount>v_invoice.total_minor-v_credited-v_invoice_allocated then raise exception using errcode='SH409',message='allocation_exceeds_available_balance';end if;
  insert into private.finance_payment_allocations(clinic_id,id,patient_id,payment_id,invoice_id,amount_minor,currency_code,actor_ref)
    values(p_clinic_id,v_id,p_patient_id,p_payment_id,p_invoice_id,v_amount,v_payment.currency_code,v_actor);
  v_receipt:=jsonb_build_object('allocation_id',v_id,'patient_id',p_patient_id,'payment_id',p_payment_id,'invoice_id',p_invoice_id,'amount_minor',v_amount,'currency_code',v_payment.currency_code,
    'payment_unapplied_minor',v_payment.amount_minor-v_refunded-v_payment_allocated-v_amount,'invoice_remaining_minor',v_invoice.total_minor-v_credited-v_invoice_allocated-v_amount,'synthetic_only',true,'replayed',false);
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
    'invoices',coalesce((select jsonb_agg(jsonb_build_object('invoice_id',i.id,'patient_id',i.patient_id,'number',i.number,'total_minor',i.total_minor,'currency_code',i.currency_code,'allocated_minor',a.total,'credited_minor',c.total,'remaining_minor',greatest(0,i.total_minor-c.total-a.total),'overpaid_minor',greatest(0,a.total-i.total_minor+c.total)) order by i.created_at desc,i.id)
      from (select * from invoices order by created_at desc,id limit 50)i cross join lateral(select coalesce(sum(amount_minor),0) total from allocations where invoice_id=i.id)a cross join lateral(select coalesce(sum(amount_minor),0) total from private.finance_invoice_credits where clinic_id=p_clinic_id and invoice_id=i.id)c),'[]'::jsonb),
    'methods',coalesce((select jsonb_agg(jsonb_build_object('id',m.method_id,'version',m.version,'code',m.code,'label',m.label,'kind',m.kind,'reference_required',m.reference_required,'settlement_behavior',m.settlement_behavior,'receiving_account',m.account_snapshot) order by m.label,m.method_id) from(select * from methods order by label,method_id limit 100)m),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
commit;
