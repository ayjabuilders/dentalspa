begin;
create function public.read_local_invoice_credit_context(p_clinic_id uuid,p_patient_id uuid,p_invoice_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_result jsonb;
begin
 v_actor:=private.authorize_local_quote_draft(p_clinic_id,p_gate);
 with credits as materialized(select * from private.finance_invoice_credits where clinic_id=p_clinic_id and patient_id=p_patient_id and invoice_id=p_invoice_id)
 select jsonb_build_object('clinic_id',p_clinic_id,'patient_id',p_patient_id,'invoice_id',d.id,'number',i.number,'synthetic_only',true,'can_credit',coalesce((select credit_allowed from private.local_finance_correction_permissions where clinic_id=p_clinic_id and actor_ref=v_actor),false),
 'total_minor',d.total_minor,'currency_code',d.currency_code,'credited_minor',c.total,'creditable_minor',d.total_minor-c.total,'allocated_minor',a.total,'remaining_minor',greatest(0,d.total_minor-c.total-a.total),'overpaid_minor',greatest(0,a.total-d.total_minor+c.total),
 'credits_truncated',(select count(*)>50 from credits),'credits',coalesce((select jsonb_agg(jsonb_build_object('credit_id',id,'number',number,'amount_minor',amount_minor,'reason',reason,'issued_at',to_char(issued_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by issued_at desc,id) from(select * from credits order by issued_at desc,id limit 50)x),'[]'::jsonb)) into v_result
 from private.finance_invoice_drafts d join private.finance_issued_invoices i on i.clinic_id=d.clinic_id and i.invoice_id=d.id
 cross join lateral(select coalesce(sum(amount_minor),0) total from credits)c
 cross join lateral(select coalesce(sum(p.amount_minor-coalesce(r.total,0)),0) total from private.finance_payment_allocations p cross join lateral(select sum(amount_minor) total from private.finance_allocation_releases where clinic_id=p_clinic_id and allocation_id=p.id)r where p.clinic_id=p_clinic_id and p.invoice_id=d.id)a
 where d.clinic_id=p_clinic_id and d.patient_id=p_patient_id and d.id=p_invoice_id;
 if v_result is null then raise exception using errcode='PT404',message='issued_invoice_unavailable';end if;return v_result;
end $$;
create function public.read_local_invoice_credit_document(p_clinic_id uuid,p_patient_id uuid,p_invoice_id uuid,p_credit_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform private.authorize_local_quote_draft(p_clinic_id,p_gate);
 select jsonb_build_object('credit_id',id,'patient_id',patient_id,'invoice_id',invoice_id,'number',number,'amount_minor',amount_minor,'currency_code',currency_code,'reason',reason,'issued_at',to_char(issued_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'snapshot',snapshot) into v_result
 from private.finance_invoice_credits where clinic_id=p_clinic_id and patient_id=p_patient_id and invoice_id=p_invoice_id and id=p_credit_id;
 if v_result is null then raise exception using errcode='PT404',message='credit_unavailable';end if;return v_result;
end $$;
revoke all on function public.read_local_invoice_credit_context(uuid,uuid,uuid,text),public.read_local_invoice_credit_document(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_local_invoice_credit_context(uuid,uuid,uuid,text),public.read_local_invoice_credit_document(uuid,uuid,uuid,uuid,text) to authenticated;
commit;
