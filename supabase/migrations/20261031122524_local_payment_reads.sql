begin;
create function public.read_local_patient_payments(p_clinic_id uuid,p_patient_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform private.authorize_local_quote_draft(p_clinic_id,p_gate);
  if not exists(select 1 from public.patients where clinic_id=p_clinic_id and id=p_patient_id) then raise exception using errcode='PT404',message='patient_unavailable';end if;
  -- All current balances and states are evaluated in the same statement snapshot.
  with allocations as materialized (select * from private.finance_payment_allocations where clinic_id=p_clinic_id and patient_id=p_patient_id),
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
      'allocated_minor',a.total,'unallocated_minor',p.amount_minor-a.total,
      'available_minor',case when s.state='confirmed' and s.settlement='settled' then p.amount_minor-a.total else 0 end,
      'receipt',case when r.id is null then null else jsonb_build_object('receipt_id',r.id,'number',r.number,'issued_at',to_char(r.issued_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) end
    ) order by p.created_at desc,p.id) from (select * from payments order by created_at desc,id limit 50) p
    cross join lateral(select * from private.finance_payment_events where clinic_id=p_clinic_id and payment_id=p.id order by version desc limit 1) s
    cross join lateral(select coalesce(sum(amount_minor),0) total from allocations where payment_id=p.id) a
    left join private.finance_payment_receipts r on r.clinic_id=p_clinic_id and r.payment_id=p.id),'[]'::jsonb),
    'invoices',coalesce((select jsonb_agg(jsonb_build_object('invoice_id',i.id,'patient_id',i.patient_id,'number',i.number,'total_minor',i.total_minor,'currency_code',i.currency_code,'allocated_minor',a.total,'remaining_minor',i.total_minor-a.total) order by i.created_at desc,i.id)
      from (select * from invoices order by created_at desc,id limit 50)i cross join lateral(select coalesce(sum(amount_minor),0) total from allocations where invoice_id=i.id)a),'[]'::jsonb),
    'methods',coalesce((select jsonb_agg(jsonb_build_object('id',m.method_id,'version',m.version,'code',m.code,'label',m.label,'kind',m.kind,'reference_required',m.reference_required,'settlement_behavior',m.settlement_behavior,'receiving_account',m.account_snapshot) order by m.label,m.method_id) from(select * from methods order by label,method_id limit 100)m),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
create function public.read_local_payment_receipt(p_clinic_id uuid,p_patient_id uuid,p_payment_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform private.authorize_local_quote_draft(p_clinic_id,p_gate);
  select jsonb_build_object('receipt_id',r.id,'patient_id',p.patient_id,'payment_id',p.id,'number',r.number,'issued_at',to_char(r.issued_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'snapshot',r.snapshot)
    into v_result from private.finance_payment_receipts r join private.finance_payments p on p.clinic_id=r.clinic_id and p.id=r.payment_id
    where p.clinic_id=p_clinic_id and p.id=p_payment_id and p.patient_id=p_patient_id;
  if not found then raise exception using errcode='PT404',message='payment_receipt_unavailable';end if;
  return v_result;
end $$;
revoke all on function public.read_local_patient_payments(uuid,uuid,text),public.read_local_payment_receipt(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_local_patient_payments(uuid,uuid,text),public.read_local_payment_receipt(uuid,uuid,uuid,text) to authenticated;
commit;
