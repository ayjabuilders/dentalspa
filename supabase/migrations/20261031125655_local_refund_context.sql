begin;
create function public.read_local_payment_refund_context(p_clinic_id uuid,p_patient_id uuid,p_payment_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_result jsonb;
begin
 v_actor:=private.authorize_local_quote_draft(p_clinic_id,p_gate);
 with allocations as materialized(
  select a.id,a.invoice_id,i.number,a.amount_minor,coalesce(r.total,0) released_minor,a.amount_minor-coalesce(r.total,0) remaining_minor,a.created_at
  from private.finance_payment_allocations a join private.finance_issued_invoices i on i.clinic_id=a.clinic_id and i.invoice_id=a.invoice_id
  cross join lateral(select sum(amount_minor) total from private.finance_allocation_releases where clinic_id=p_clinic_id and allocation_id=a.id) r
  where a.clinic_id=p_clinic_id and a.patient_id=p_patient_id and a.payment_id=p_payment_id
 ), refunds as materialized(select * from private.finance_payment_refunds where clinic_id=p_clinic_id and patient_id=p_patient_id and payment_id=p_payment_id)
 select jsonb_build_object('clinic_id',p_clinic_id,'patient_id',p_patient_id,'payment_id',p.id,'synthetic_only',true,
 'can_refund',coalesce((select refund_allowed from private.local_finance_correction_permissions where clinic_id=p_clinic_id and actor_ref=v_actor),false),
 'state',s.state,'settlement',s.settlement,'amount_minor',p.amount_minor,'currency_code',p.currency_code,
 'refunded_minor',f.total,'net_paid_minor',p.amount_minor-f.total,'allocated_minor',a.total,'unallocated_minor',p.amount_minor-f.total-a.total,
 'allocations_truncated',(select count(*)>100 from allocations),'refunds_truncated',(select count(*)>50 from refunds),
 'allocations',coalesce((select jsonb_agg(jsonb_build_object('allocation_id',id,'invoice_id',invoice_id,'invoice_number',number,'amount_minor',amount_minor,'released_minor',released_minor,'remaining_minor',remaining_minor) order by created_at,id) from(select * from allocations order by created_at,id limit 100)x),'[]'::jsonb),
 'refunds',coalesce((select jsonb_agg(jsonb_build_object('refund_id',id,'kind',kind,'amount_minor',amount_minor,'reason',reason,'reference',reference,'effective_at',to_char(effective_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'created_at',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by created_at desc,id) from(select * from refunds order by created_at desc,id limit 50)x),'[]'::jsonb)
 ) into v_result from private.finance_payments p
 cross join lateral(select * from private.finance_payment_events where clinic_id=p_clinic_id and payment_id=p.id order by version desc limit 1)s
 cross join lateral(select coalesce(sum(amount_minor),0) total from refunds) f
 cross join lateral(select coalesce(sum(remaining_minor),0) total from allocations) a
 where p.clinic_id=p_clinic_id and p.patient_id=p_patient_id and p.id=p_payment_id;
 if v_result is null then raise exception using errcode='PT404',message='payment_unavailable';end if;
 return v_result;
end $$;
revoke all on function public.read_local_payment_refund_context(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_local_payment_refund_context(uuid,uuid,uuid,text) to authenticated;
commit;
