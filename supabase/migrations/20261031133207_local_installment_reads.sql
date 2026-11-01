begin;
create function public.read_local_installment_plans(p_clinic_id uuid,p_patient_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform private.authorize_local_quote_draft(p_clinic_id,p_gate);
 perform 1 from public.patients where clinic_id=p_clinic_id and id=p_patient_id;
 if not found then raise exception using errcode='PT404',message='patient_unavailable';end if;
 with plans as materialized(select * from private.finance_installment_plans where clinic_id=p_clinic_id and patient_id=p_patient_id),
 page as(select * from plans order by created_at desc,id limit 50)
 select jsonb_build_object('clinic_id',p_clinic_id,'patient_id',p_patient_id,'synthetic_only',true,
 'can_write',exists(select 1 from private.local_installment_settings where clinic_id=p_clinic_id and enabled and synthetic_only),
 'truncated',(select count(*)>50 from plans),'items',coalesce((select jsonb_agg(jsonb_build_object('plan_id',p.id,'latest_version',p.latest_version,'accepted_version',p.accepted_version,'agreed_minor',v.agreed_minor,'currency_code',v.currency_code,'status',coalesce((select case when count(*)=0 then 'draft' when bool_or(action='accepted') then 'accepted' else 'approved' end from private.finance_installment_events where clinic_id=p.clinic_id and plan_id=p.id and version=p.latest_version),'draft'),'created_at',to_char(p.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by p.created_at desc,p.id) from page p join private.finance_installment_versions v on v.clinic_id=p.clinic_id and v.plan_id=p.id and v.version=p.latest_version),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
create function public.read_local_installment_version(p_clinic_id uuid,p_patient_id uuid,p_plan_id uuid,p_version integer,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform private.authorize_local_quote_draft(p_clinic_id,p_gate);
 select jsonb_build_object('clinic_id',p_clinic_id,'patient_id',p_patient_id,'plan_id',p.id,'latest_version',p.latest_version,'accepted_version',p.accepted_version,
 'version',v.version,'agreed_minor',v.agreed_minor,'currency_code',v.currency_code,'reason',v.reason,'snapshot',v.snapshot,'created_by',v.created_by,'created_at',to_char(v.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'lines',(select jsonb_agg(jsonb_build_object('line_id',l.id,'invoice_id',l.invoice_id,'due_on',to_char(l.due_on,'YYYY-MM-DD'),'amount_minor',l.amount_minor) order by l.due_on,l.invoice_id,l.id) from private.finance_installment_lines l where l.clinic_id=p.clinic_id and l.plan_id=p.id and l.version=v.version),
 'events',coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'actor_ref',e.actor_ref,'reference',e.reference,'created_at',to_char(e.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by e.created_at,e.action) from private.finance_installment_events e where e.clinic_id=p.clinic_id and e.plan_id=p.id and e.version=v.version),'[]'::jsonb)) into v_result
 from private.finance_installment_plans p join private.finance_installment_versions v on v.clinic_id=p.clinic_id and v.plan_id=p.id
 where p.clinic_id=p_clinic_id and p.patient_id=p_patient_id and p.id=p_plan_id and v.version=p_version;
 if v_result is null then raise exception using errcode='PT404',message='agreement_version_unavailable';end if;return v_result;
end $$;
revoke all on function public.read_local_installment_plans(uuid,uuid,text),public.read_local_installment_version(uuid,uuid,uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.read_local_installment_plans(uuid,uuid,text),public.read_local_installment_version(uuid,uuid,uuid,integer,text) to authenticated;
commit;
