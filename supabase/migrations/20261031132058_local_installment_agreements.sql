begin;
-- Local synthetic agreements only. No reminder dispatch or money movement.
create table private.local_installment_settings(
 clinic_id uuid primary key references public.clinics(id), enabled boolean not null default false,
 synthetic_only boolean not null default true check(synthetic_only)
);
create table private.finance_installment_plans(
 clinic_id uuid not null, id uuid not null default gen_random_uuid(), patient_id uuid not null,
 latest_version integer not null default 0 check(latest_version>=0), accepted_version integer,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp(),
 primary key(clinic_id,id),foreign key(clinic_id,patient_id) references public.patients(clinic_id,id)
);
create index installment_patient on private.finance_installment_plans(clinic_id,patient_id,created_at);
-- One agreement owns an invoice. Revisions retain its invoice set and history.
create table private.finance_installment_invoices(
 clinic_id uuid not null,plan_id uuid not null,invoice_id uuid not null,
 primary key(clinic_id,invoice_id),unique(clinic_id,plan_id,invoice_id),
 foreign key(clinic_id,plan_id) references private.finance_installment_plans(clinic_id,id),
 foreign key(clinic_id,invoice_id) references private.finance_issued_invoices(clinic_id,invoice_id)
);
create table private.finance_installment_versions(
 clinic_id uuid not null,plan_id uuid not null,version integer not null check(version>0),
 agreed_minor bigint not null check(agreed_minor between 1 and 1000000000000),
 currency_code text not null check(currency_code='MAD'), reason text not null check(char_length(btrim(reason)) between 1 and 240),
 snapshot jsonb not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 primary key(clinic_id,plan_id,version),foreign key(clinic_id,plan_id) references private.finance_installment_plans(clinic_id,id)
);
create table private.finance_installment_lines(
 clinic_id uuid not null,plan_id uuid not null,version integer not null,id uuid not null default gen_random_uuid(),
 invoice_id uuid not null,due_on date not null check(due_on between date '2000-01-01' and date '2100-12-31'),
 amount_minor bigint not null check(amount_minor between 1 and 1000000000000),
 primary key(clinic_id,id),unique(clinic_id,plan_id,version,invoice_id,due_on),
 foreign key(clinic_id,plan_id,version) references private.finance_installment_versions(clinic_id,plan_id,version),
 foreign key(clinic_id,plan_id,invoice_id) references private.finance_installment_invoices(clinic_id,plan_id,invoice_id)
);
create index installment_lines_version on private.finance_installment_lines(clinic_id,plan_id,version,due_on);
create table private.finance_installment_events(
 clinic_id uuid not null,plan_id uuid not null,version integer not null,action text not null check(action in('approved','accepted')),
 actor_ref uuid not null references auth.users(id),reference text not null check(char_length(btrim(reference)) between 1 and 120),
 created_at timestamptz not null default clock_timestamp(),primary key(clinic_id,plan_id,version,action),
 foreign key(clinic_id,plan_id,version) references private.finance_installment_versions(clinic_id,plan_id,version)
);
create table private.finance_installment_commands(
 clinic_id uuid not null references public.clinics(id),actor_ref uuid not null references auth.users(id),request_key uuid not null,
 payload jsonb not null,receipt jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(clinic_id,actor_ref,request_key)
);
alter table private.local_installment_settings enable row level security;
alter table private.finance_installment_plans enable row level security;
alter table private.finance_installment_invoices enable row level security;
alter table private.finance_installment_versions enable row level security;
alter table private.finance_installment_lines enable row level security;
alter table private.finance_installment_events enable row level security;
alter table private.finance_installment_commands enable row level security;
revoke all on private.local_installment_settings,private.finance_installment_plans,private.finance_installment_invoices,private.finance_installment_versions,private.finance_installment_lines,private.finance_installment_events,private.finance_installment_commands from public,anon,authenticated,service_role;
create trigger installment_scope_immutable before update or delete on private.finance_installment_invoices for each row execute function private.reject_finance_snapshot_mutation();
create trigger installment_version_immutable before update or delete on private.finance_installment_versions for each row execute function private.reject_finance_snapshot_mutation();
create trigger installment_line_immutable before update or delete on private.finance_installment_lines for each row execute function private.reject_finance_snapshot_mutation();
create trigger installment_event_immutable before update or delete on private.finance_installment_events for each row execute function private.reject_finance_snapshot_mutation();
create trigger installment_command_immutable before update or delete on private.finance_installment_commands for each row execute function private.reject_finance_snapshot_mutation();

create function public.save_local_installment_draft(p_clinic_id uuid,p_patient_id uuid,p_payload jsonb,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_plan uuid;v_expected integer;v_latest integer;v_prior private.finance_installment_commands;
 v_command jsonb;v_receipt jsonb;v_item jsonb;v_invoice uuid;v_context jsonb;v_snapshots jsonb:='[]';
 v_total bigint:=0;v_sum numeric;v_ids uuid[];v_existing uuid[];v_date date;v_action text:='LocalInstallmentDraftSaved';
begin
 v_actor:=private.authorize_local_quote_draft(p_clinic_id,p_gate);
 perform 1 from private.local_installment_settings where clinic_id=p_clinic_id and enabled and synthetic_only for share;
 if not found then raise exception using errcode='PT503',message='local_installments_unavailable';end if;
 if p_patient_id is null or p_request_key is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception using errcode='22023',message='invalid_agreement';end if;
 if not(p_payload ?& array['plan_id','expected_version','reason','invoices','lines']) or exists(select 1 from jsonb_object_keys(p_payload)k where k not in('plan_id','expected_version','reason','invoices','lines'))
 or jsonb_typeof(p_payload->'reason') is distinct from 'string' or char_length(btrim(p_payload->>'reason')) not between 1 and 240
 or jsonb_typeof(p_payload->'expected_version') is distinct from 'number' or (p_payload->>'expected_version') !~ '^(0|[1-9][0-9]{0,7})$'
 or jsonb_typeof(p_payload->'invoices') is distinct from 'array' or jsonb_typeof(p_payload->'lines') is distinct from 'array' then raise exception using errcode='22023',message='invalid_agreement';end if;
 if jsonb_array_length(p_payload->'invoices') not between 1 and 20 or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception using errcode='22023',message='invalid_agreement_size';end if;
 v_expected:=(p_payload->>'expected_version')::integer;
 begin v_plan:=(p_payload->>'plan_id')::uuid;exception when invalid_text_representation then raise exception using errcode='22023',message='invalid_plan';end;
 if (v_plan is null)<>(v_expected=0) then raise exception using errcode='22023',message='invalid_plan_version';end if;
 v_command:=jsonb_build_object('action','save','patient_id',p_patient_id,'payload',p_payload);
 perform pg_advisory_xact_lock(hashtextextended('installment:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
 select * into v_prior from private.finance_installment_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
 if found then if v_prior.payload<>v_command then raise exception using errcode='SH410',message='command_key_reused';end if;return v_prior.receipt||jsonb_build_object('replayed',true);end if;
 if v_plan is null then
  perform 1 from public.patients where clinic_id=p_clinic_id and id=p_patient_id;
  if not found then raise exception using errcode='PT404',message='patient_unavailable';end if;
  insert into private.finance_installment_plans(clinic_id,patient_id,created_by) values(p_clinic_id,p_patient_id,v_actor) returning id into v_plan;
 else
  select latest_version into v_latest from private.finance_installment_plans where clinic_id=p_clinic_id and id=v_plan and patient_id=p_patient_id for update;
  if not found then raise exception using errcode='PT404',message='agreement_unavailable';end if;
  if v_latest<>v_expected then raise exception using errcode='SH409',message='agreement_version_conflict';end if;
 end if;
 -- Validate explicit client-reviewed deposit (all net allocations) and credit treatment.
 for v_item in select value from jsonb_array_elements(p_payload->'invoices') loop
  if jsonb_typeof(v_item) is distinct from 'object' or not(v_item ?& array['invoice_id','deposit_minor','credited_minor']) or exists(select 1 from jsonb_object_keys(v_item)k where k not in('invoice_id','deposit_minor','credited_minor'))
   or jsonb_typeof(v_item->'deposit_minor') is distinct from 'number' or (v_item->>'deposit_minor') !~ '^(0|[1-9][0-9]{0,12})$'
   or jsonb_typeof(v_item->'credited_minor') is distinct from 'number' or (v_item->>'credited_minor') !~ '^(0|[1-9][0-9]{0,12})$' then raise exception using errcode='22023',message='invalid_invoice_treatment';end if;
  begin v_invoice:=(v_item->>'invoice_id')::uuid;exception when invalid_text_representation then raise exception using errcode='22023',message='invalid_invoice_id';end;
  if v_invoice is null or v_invoice=any(coalesce(v_ids,'{}'::uuid[])) then raise exception using errcode='22023',message='duplicate_invoice';end if;
  v_ids:=array_append(v_ids,v_invoice);
 end loop;
 select array_agg(x order by x) into v_ids from unnest(v_ids)x;
 if v_expected>0 then
  select array_agg(invoice_id order by invoice_id) into v_existing from private.finance_installment_invoices where clinic_id=p_clinic_id and plan_id=v_plan;
  if v_existing<>v_ids then raise exception using errcode='SH409',message='agreement_invoice_scope_changed';end if;
 end if;
 -- Same locks as allocation, credit and refund writers, acquired in UUID order.
 foreach v_invoice in array v_ids loop
  perform 1 from private.finance_invoice_drafts where clinic_id=p_clinic_id and patient_id=p_patient_id and id=v_invoice for update;
  if not found then raise exception using errcode='PT404',message='invoice_unavailable';end if;
  v_context:=public.read_local_invoice_credit_context(p_clinic_id,p_patient_id,v_invoice,p_gate);
  select value into v_item from jsonb_array_elements(p_payload->'invoices') where (value->>'invoice_id')::uuid=v_invoice;
  if (v_item->>'deposit_minor')::numeric<>(v_context->>'allocated_minor')::numeric or (v_item->>'credited_minor')::numeric<>(v_context->>'credited_minor')::numeric then raise exception using errcode='SH409',message='invoice_balance_changed';end if;
  if (v_context->>'remaining_minor')::bigint<=0 then raise exception using errcode='SH409',message='invoice_has_no_remaining_balance';end if;
  if v_expected=0 then
   if exists(select 1 from private.finance_installment_invoices where clinic_id=p_clinic_id and invoice_id=v_invoice) then raise exception using errcode='SH409',message='invoice_already_scheduled';end if;
   insert into private.finance_installment_invoices values(p_clinic_id,v_plan,v_invoice);
  end if;
  v_total:=v_total+(v_context->>'remaining_minor')::bigint;
  v_snapshots:=v_snapshots||jsonb_build_array(jsonb_build_object('invoice_id',v_invoice,'number',v_context->>'number','total_minor',(v_context->>'total_minor')::bigint,'deposit_minor',(v_context->>'allocated_minor')::bigint,'credited_minor',(v_context->>'credited_minor')::bigint,'scheduled_minor',(v_context->>'remaining_minor')::bigint));
 end loop;
 if v_total>1000000000000 then raise exception using errcode='22023',message='agreement_total_exceeded';end if;
 for v_item in select value from jsonb_array_elements(p_payload->'lines') loop
  if jsonb_typeof(v_item) is distinct from 'object' or not(v_item ?& array['invoice_id','due_on','amount_minor']) or exists(select 1 from jsonb_object_keys(v_item)k where k not in('invoice_id','due_on','amount_minor'))
   or jsonb_typeof(v_item->'amount_minor') is distinct from 'number' or (v_item->>'amount_minor') !~ '^[1-9][0-9]{0,12}$' or (v_item->>'amount_minor')::numeric>1000000000000
   or (v_item->>'due_on') is null or (v_item->>'due_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception using errcode='22023',message='invalid_installment';end if;
  begin v_invoice:=(v_item->>'invoice_id')::uuid;v_date:=(v_item->>'due_on')::date;exception when invalid_text_representation or datetime_field_overflow then raise exception using errcode='22023',message='invalid_installment';end;
  if v_invoice is null or not(v_invoice=any(v_ids)) or v_date not between date '2000-01-01' and date '2100-12-31' then raise exception using errcode='22023',message='invalid_installment';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_payload->'lines') x group by (x->>'invoice_id')::uuid,x->>'due_on' having count(*)>1) then raise exception using errcode='22023',message='duplicate_installment_date';end if;
 for v_item in select value from jsonb_array_elements(v_snapshots) loop
  select coalesce(sum((x->>'amount_minor')::numeric),0) into v_sum from jsonb_array_elements(p_payload->'lines')x where (x->>'invoice_id')::uuid=(v_item->>'invoice_id')::uuid;
  if v_sum<>(v_item->>'scheduled_minor')::numeric then raise exception using errcode='22023',message='installment_sum_mismatch';end if;
 end loop;
 insert into private.finance_installment_versions(clinic_id,plan_id,version,agreed_minor,currency_code,reason,snapshot,created_by)
 values(p_clinic_id,v_plan,v_expected+1,v_total,'MAD',p_payload->>'reason',jsonb_build_object('schema_version',1,'synthetic_only',true,'deposit_treatment','net_allocations_at_version','credit_treatment','posted_credits_at_version','invoices',v_snapshots),v_actor);
 insert into private.finance_installment_lines(clinic_id,plan_id,version,invoice_id,due_on,amount_minor)
 select p_clinic_id,v_plan,v_expected+1,(x->>'invoice_id')::uuid,(x->>'due_on')::date,(x->>'amount_minor')::bigint from jsonb_array_elements(p_payload->'lines')x;
 update private.finance_installment_plans set latest_version=v_expected+1 where clinic_id=p_clinic_id and id=v_plan;
 v_receipt:=jsonb_build_object('plan_id',v_plan,'patient_id',p_patient_id,'version',v_expected+1,'agreed_minor',v_total,'currency_code','MAD','status','draft','synthetic_only',true,'replayed',false);
 insert into private.finance_installment_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,v_command,v_receipt);
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,v_action,v_plan,p_request_key);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,v_action,1,'finance_installment_plan',v_plan,p_request_key,v_actor,jsonb_build_object('synthetic_only',true,'version',v_expected+1));
 return v_receipt;
end $$;
revoke all on function public.save_local_installment_draft(uuid,uuid,jsonb,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.save_local_installment_draft(uuid,uuid,jsonb,uuid,text) to authenticated;

create function public.transition_local_installment_agreement(p_clinic_id uuid,p_patient_id uuid,p_plan_id uuid,p_version integer,p_action text,p_reference text,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_plan private.finance_installment_plans;v_prior private.finance_installment_commands;v_command jsonb;v_receipt jsonb;v_snapshot jsonb;v_item jsonb;v_context jsonb;v_invoice uuid;v_event text;
begin
 v_actor:=private.authorize_local_quote_draft(p_clinic_id,p_gate);
 perform 1 from private.local_installment_settings where clinic_id=p_clinic_id and enabled and synthetic_only for share;
 if not found then raise exception using errcode='PT503',message='local_installments_unavailable';end if;
 if p_patient_id is null or p_plan_id is null or p_version is null or p_version<1 or p_action is null or p_action not in('approved','accepted') or p_reference is null or p_reference !~ '^DEMO-' or char_length(p_reference)>120 or p_request_key is null then raise exception using errcode='22023',message='invalid_agreement_transition';end if;
 v_command:=jsonb_build_object('action',p_action,'patient_id',p_patient_id,'plan_id',p_plan_id,'version',p_version,'reference',p_reference);
 perform pg_advisory_xact_lock(hashtextextended('installment:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
 select * into v_prior from private.finance_installment_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
 if found then if v_prior.payload<>v_command then raise exception using errcode='SH410',message='command_key_reused';end if;return v_prior.receipt||jsonb_build_object('replayed',true);end if;
 select * into v_plan from private.finance_installment_plans where clinic_id=p_clinic_id and patient_id=p_patient_id and id=p_plan_id for update;
 if not found then raise exception using errcode='PT404',message='agreement_unavailable';end if;
 if v_plan.latest_version<>p_version then raise exception using errcode='SH409',message='agreement_version_conflict';end if;
 if exists(select 1 from private.finance_installment_events where clinic_id=p_clinic_id and plan_id=p_plan_id and version=p_version and action=p_action) then raise exception using errcode='SH409',message='agreement_transition_already_recorded';end if;
 if p_action='accepted' and not exists(select 1 from private.finance_installment_events where clinic_id=p_clinic_id and plan_id=p_plan_id and version=p_version and action='approved') then raise exception using errcode='SH409',message='agreement_approval_required';end if;
 select snapshot into v_snapshot from private.finance_installment_versions where clinic_id=p_clinic_id and plan_id=p_plan_id and version=p_version;
 for v_item in select value from jsonb_array_elements(v_snapshot->'invoices') order by (value->>'invoice_id')::uuid loop
  v_invoice:=(v_item->>'invoice_id')::uuid;
  perform 1 from private.finance_invoice_drafts where clinic_id=p_clinic_id and id=v_invoice for update;
  v_context:=public.read_local_invoice_credit_context(p_clinic_id,p_patient_id,v_invoice,p_gate);
  if (v_context->>'allocated_minor')::bigint<>(v_item->>'deposit_minor')::bigint or (v_context->>'credited_minor')::bigint<>(v_item->>'credited_minor')::bigint then raise exception using errcode='SH409',message='invoice_balance_changed';end if;
 end loop;
 insert into private.finance_installment_events(clinic_id,plan_id,version,action,actor_ref,reference) values(p_clinic_id,p_plan_id,p_version,p_action,v_actor,p_reference);
 if p_action='accepted' then update private.finance_installment_plans set accepted_version=p_version where clinic_id=p_clinic_id and id=p_plan_id;end if;
 v_receipt:=jsonb_build_object('plan_id',p_plan_id,'patient_id',p_patient_id,'version',p_version,'status',p_action,'synthetic_only',true,'replayed',false);
 insert into private.finance_installment_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,v_command,v_receipt);
 v_event:=case p_action when 'approved' then 'LocalInstallmentApproved' else 'LocalInstallmentAcceptanceRecorded' end;
 insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,v_event,p_plan_id,p_request_key);
 insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,v_event,1,'finance_installment_plan',p_plan_id,p_request_key,v_actor,jsonb_build_object('synthetic_only',true,'version',p_version));
 return v_receipt;
end $$;
revoke all on function public.transition_local_installment_agreement(uuid,uuid,uuid,integer,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.transition_local_installment_agreement(uuid,uuid,uuid,integer,text,text,uuid,text) to authenticated;
commit;
