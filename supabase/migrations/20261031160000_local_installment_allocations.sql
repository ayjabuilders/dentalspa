begin;
-- Synthetic local installment settlement. No provider calls or automatic reminders.
create table private.finance_installment_allocations(
 clinic_id uuid not null,line_id uuid not null,allocation_id uuid not null,
 primary key(clinic_id,allocation_id),
 foreign key(clinic_id,line_id) references private.finance_installment_lines(clinic_id,id),
 foreign key(clinic_id,allocation_id) references private.finance_payment_allocations(clinic_id,id)
);
create index installment_allocation_line on private.finance_installment_allocations(clinic_id,line_id);
alter table private.finance_installment_allocations enable row level security;
revoke all on private.finance_installment_allocations from public,anon,authenticated,service_role;
create trigger installment_allocation_immutable before update or delete on private.finance_installment_allocations for each row execute function private.reject_finance_snapshot_mutation();

create function private.installment_line_paid(p_clinic_id uuid,p_line_id uuid)
returns bigint language sql stable set search_path='' as $$
 select coalesce(sum(a.amount_minor-coalesce(r.released,0)),0)::bigint
 from private.finance_installment_allocations i
 join private.finance_payment_allocations a on a.clinic_id=i.clinic_id and a.id=i.allocation_id
 left join lateral(select sum(amount_minor) released from private.finance_allocation_releases where clinic_id=a.clinic_id and allocation_id=a.id)r on true
 where i.clinic_id=p_clinic_id and i.line_id=p_line_id
$$;
revoke all on function private.installment_line_paid(uuid,uuid) from public,anon,authenticated,service_role;

create function public.allocate_local_installment_payment(p_clinic_id uuid,p_patient_id uuid,p_plan_id uuid,p_version integer,p_line_id uuid,p_payment_id uuid,p_amount_minor numeric,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_plan private.finance_installment_plans;v_line private.finance_installment_lines;
 v_prior private.finance_installment_commands;v_command jsonb;v_receipt jsonb;v_allocation jsonb;v_context jsonb;v_snapshot jsonb;
 v_paid bigint;v_invoice_paid bigint;v_scheduled bigint;
begin
 v_actor:=private.authorize_local_payment(p_clinic_id,p_gate);
 perform 1 from private.local_installment_settings where clinic_id=p_clinic_id and enabled and synthetic_only for share;
 if not found then raise exception using errcode='PT503',message='local_installments_unavailable';end if;
 if p_patient_id is null or p_plan_id is null or p_version is null or p_version<1 or p_line_id is null or p_payment_id is null or p_request_key is null or p_amount_minor is null or p_amount_minor<1 or p_amount_minor>1000000000000 or trunc(p_amount_minor)<>p_amount_minor then raise exception using errcode='22023',message='invalid_installment_allocation';end if;
 v_command:=jsonb_build_object('action','allocate_installment','patient_id',p_patient_id,'plan_id',p_plan_id,'version',p_version,'line_id',p_line_id,'payment_id',p_payment_id,'amount_minor',p_amount_minor::bigint);
 perform pg_advisory_xact_lock(hashtextextended('installment:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
 select * into v_prior from private.finance_installment_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
 if found then if v_prior.payload<>v_command then raise exception using errcode='SH410',message='command_key_reused';end if;return v_prior.receipt||jsonb_build_object('replayed',true);end if;
 -- Same advisory/payment order as the existing payment writer; then plan, then invoice.
 perform pg_advisory_xact_lock(hashtextextended('payment:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
 perform 1 from private.finance_payments where clinic_id=p_clinic_id and patient_id=p_patient_id and id=p_payment_id for update;
 if not found then raise exception using errcode='PT404',message='payment_unavailable';end if;
 select * into v_plan from private.finance_installment_plans where clinic_id=p_clinic_id and patient_id=p_patient_id and id=p_plan_id for update;
 if not found then raise exception using errcode='PT404',message='agreement_unavailable';end if;
 if v_plan.accepted_version is distinct from p_version then raise exception using errcode='SH409',message='accepted_agreement_version_required';end if;
 select * into v_line from private.finance_installment_lines where clinic_id=p_clinic_id and plan_id=p_plan_id and version=p_version and id=p_line_id;
 if not found then raise exception using errcode='PT404',message='installment_unavailable';end if;
 perform 1 from private.finance_invoice_drafts where clinic_id=p_clinic_id and id=v_line.invoice_id for update;
 v_paid:=private.installment_line_paid(p_clinic_id,p_line_id);
 if p_amount_minor>v_line.amount_minor-v_paid then raise exception using errcode='SH409',message='installment_balance_exceeded';end if;
 select snapshot into v_snapshot from private.finance_installment_versions where clinic_id=p_clinic_id and plan_id=p_plan_id and version=p_version;
 select (x->>'scheduled_minor')::bigint into v_scheduled from jsonb_array_elements(v_snapshot->'invoices')x where (x->>'invoice_id')::uuid=v_line.invoice_id;
 select coalesce(sum(private.installment_line_paid(p_clinic_id,l.id)),0) into v_invoice_paid from private.finance_installment_lines l where l.clinic_id=p_clinic_id and l.plan_id=p_plan_id and l.version=p_version and l.invoice_id=v_line.invoice_id;
 v_context:=public.read_local_invoice_credit_context(p_clinic_id,p_patient_id,v_line.invoice_id,p_gate);
 if (v_context->>'remaining_minor')::bigint<>v_scheduled-v_invoice_paid then raise exception using errcode='SH409',message='agreement_balance_changed';end if;
 v_allocation:=public.allocate_local_payment(p_clinic_id,p_patient_id,p_payment_id,v_line.invoice_id,p_amount_minor,p_request_key,p_gate);
 -- A previously standalone allocation cannot be re-labelled or double-counted as a new installment payment.
 if (v_allocation->>'replayed')::boolean then raise exception using errcode='SH410',message='command_key_reused';end if;
 insert into private.finance_installment_allocations values(p_clinic_id,p_line_id,(v_allocation->>'allocation_id')::uuid);
 v_receipt:=v_allocation||jsonb_build_object('plan_id',p_plan_id,'version',p_version,'line_id',p_line_id,'line_paid_minor',v_paid+p_amount_minor::bigint,'line_remaining_minor',v_line.amount_minor-v_paid-p_amount_minor::bigint);
 insert into private.finance_installment_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,v_command,v_receipt);
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalInstallmentPaymentAllocated',p_plan_id,p_request_key);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'LocalInstallmentPaymentAllocated',1,'finance_installment_plan',p_plan_id,p_request_key,v_actor,jsonb_build_object('synthetic_only',true,'version',p_version));
 return v_receipt;
end $$;

create function public.read_local_installment_balances(p_clinic_id uuid,p_patient_id uuid,p_plan_id uuid,p_version integer,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_plan private.finance_installment_plans;v_snapshot jsonb;v_lines jsonb;v_invoices jsonb:='[]'::jsonb;v_item jsonb;v_context jsonb;v_paid bigint;v_review boolean:=false;v_changed boolean;v_today date:=(clock_timestamp() at time zone 'Africa/Casablanca')::date;
begin
 perform private.authorize_local_quote_draft(p_clinic_id,p_gate);
 select * into v_plan from private.finance_installment_plans where clinic_id=p_clinic_id and patient_id=p_patient_id and id=p_plan_id;
 if not found then raise exception using errcode='PT404',message='agreement_unavailable';end if;
 select snapshot into v_snapshot from private.finance_installment_versions where clinic_id=p_clinic_id and plan_id=p_plan_id and version=p_version;
 if not found then raise exception using errcode='PT404',message='agreement_version_unavailable';end if;
 for v_item in select value from jsonb_array_elements(v_snapshot->'invoices') loop
  v_context:=public.read_local_invoice_credit_context(p_clinic_id,p_patient_id,(v_item->>'invoice_id')::uuid,p_gate);
  select coalesce(sum(private.installment_line_paid(p_clinic_id,l.id)),0) into v_paid from private.finance_installment_lines l where l.clinic_id=p_clinic_id and l.plan_id=p_plan_id and l.version=p_version and l.invoice_id=(v_item->>'invoice_id')::uuid;
  v_changed:=(v_context->>'remaining_minor')::bigint<>(v_item->>'scheduled_minor')::bigint-v_paid;v_review:=v_review or v_changed;
  v_invoices:=v_invoices||jsonb_build_array(jsonb_build_object('invoice_id',v_item->>'invoice_id','invoice_remaining_minor',(v_context->>'remaining_minor')::bigint,'scheduled_remaining_minor',(v_item->>'scheduled_minor')::bigint-v_paid,'requires_revision',v_changed));
 end loop;
 select jsonb_agg(jsonb_build_object('line_id',l.id,'invoice_id',l.invoice_id,'due_on',to_char(l.due_on,'YYYY-MM-DD'),'amount_minor',l.amount_minor,'paid_minor',p.paid,'remaining_minor',l.amount_minor-p.paid,'payment_state',case when p.paid=l.amount_minor then 'paid' when p.paid>0 then 'partial' else 'unpaid' end,'overdue',coalesce(v_plan.accepted_version=p_version,false) and l.due_on<v_today and l.amount_minor>p.paid) order by l.due_on,l.id) into v_lines
 from private.finance_installment_lines l cross join lateral(select private.installment_line_paid(p_clinic_id,l.id) paid)p where l.clinic_id=p_clinic_id and l.plan_id=p_plan_id and l.version=p_version;
 return jsonb_build_object('clinic_id',p_clinic_id,'patient_id',p_patient_id,'plan_id',p_plan_id,'version',p_version,'active',coalesce(v_plan.accepted_version=p_version,false),'as_of_date',to_char(v_today,'YYYY-MM-DD'),'time_zone','Africa/Casablanca','synthetic_only',true,'requires_revision',v_review,'invoices',v_invoices,'lines',v_lines);
end $$;
revoke all on function public.allocate_local_installment_payment(uuid,uuid,uuid,integer,uuid,uuid,numeric,uuid,text),public.read_local_installment_balances(uuid,uuid,uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.allocate_local_installment_payment(uuid,uuid,uuid,integer,uuid,uuid,numeric,uuid,text),public.read_local_installment_balances(uuid,uuid,uuid,integer,text) to authenticated;
commit;
