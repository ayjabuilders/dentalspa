begin;
-- Synthetic invoice preparation/numbering only. No clinic enabled here.
create table private.local_invoice_settings(
  clinic_id uuid primary key references public.clinics(id),
  drafts_enabled boolean not null default false,issuance_enabled boolean not null default false,
  synthetic_only boolean not null default true check(synthetic_only),
  series_code text not null default 'DEMO' check(series_code ~ '^DEMO(-[A-Z0-9]{1,16})?$')
);
create table private.finance_invoice_counters(
  clinic_id uuid not null references public.clinics(id),series_code text not null,
  next_number bigint not null default 1 check(next_number between 1 and 999999999),
  primary key(clinic_id,series_code)
);
create table private.finance_invoice_drafts(
  clinic_id uuid not null,id uuid not null default gen_random_uuid(),patient_id uuid not null,
  quote_id uuid not null,quote_version integer not null,snapshot jsonb not null,
  total_minor bigint not null check(total_minor>0),currency_code text not null check(currency_code='MAD'),
  created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,id),unique(clinic_id,quote_id,quote_version),
  foreign key(clinic_id,patient_id) references public.patients(clinic_id,id),
  foreign key(clinic_id,quote_id,quote_version) references private.finance_quote_versions(clinic_id,quote_id,version)
);
create table private.finance_issued_invoices(
  clinic_id uuid not null,invoice_id uuid not null,series_code text not null,sequence_number bigint not null check(sequence_number>0),
  number text not null,issued_by uuid not null references auth.users(id),issued_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,invoice_id),unique(clinic_id,series_code,sequence_number),unique(clinic_id,number),
  foreign key(clinic_id,invoice_id) references private.finance_invoice_drafts(clinic_id,id)
);
create table private.finance_invoice_commands(
  clinic_id uuid not null references public.clinics(id),actor_ref uuid not null references auth.users(id),request_key uuid not null,
  payload jsonb not null,receipt jsonb not null,created_at timestamptz not null default clock_timestamp(),
  primary key(clinic_id,actor_ref,request_key)
);
alter table private.local_invoice_settings enable row level security;
alter table private.finance_invoice_counters enable row level security;
alter table private.finance_invoice_drafts enable row level security;
alter table private.finance_issued_invoices enable row level security;
alter table private.finance_invoice_commands enable row level security;
revoke all on private.local_invoice_settings,private.finance_invoice_counters,private.finance_invoice_drafts,private.finance_issued_invoices,private.finance_invoice_commands from public,anon,authenticated,service_role;
create trigger invoice_draft_immutable before update or delete on private.finance_invoice_drafts for each row execute function private.reject_finance_snapshot_mutation();
create trigger issued_invoice_immutable before update or delete on private.finance_issued_invoices for each row execute function private.reject_finance_snapshot_mutation();
create trigger invoice_command_immutable before update or delete on private.finance_invoice_commands for each row execute function private.reject_finance_snapshot_mutation();

create function private.authorize_local_invoice(p_clinic_id uuid,p_gate text,p_issuance boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_actor uuid;
begin
  v_actor:=private.authorize_local_quote_draft(p_clinic_id,p_gate);
  perform 1 from private.local_invoice_settings where clinic_id=p_clinic_id and drafts_enabled and synthetic_only and (not p_issuance or issuance_enabled) for share;
  if not found then raise exception using errcode='PT503',message='local_invoice_disabled'; end if;
  return v_actor;
end $$;
revoke all on function private.authorize_local_invoice(uuid,text,boolean) from public,anon,authenticated,service_role;

create function public.prepare_local_invoice(p_clinic_id uuid,p_patient_id uuid,p_quote_id uuid,p_quote_version integer,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_prior private.finance_invoice_commands;v_payload jsonb;v_snapshot jsonb;v_patient jsonb;v_clinic jsonb;v_total bigint;v_id uuid:=gen_random_uuid();v_receipt jsonb;v_current integer;
begin
  v_actor:=private.authorize_local_invoice(p_clinic_id,p_gate,false);
  if p_patient_id is null or p_quote_id is null or p_quote_version is null or p_quote_version<1 or p_request_key is null then raise exception using errcode='22023',message='invalid_invoice_command'; end if;
  v_payload:=jsonb_build_object('action','prepare','patient_id',p_patient_id,'quote_id',p_quote_id,'quote_version',p_quote_version);
  perform pg_advisory_xact_lock(hashtextextended('invoice:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
  select * into v_prior from private.finance_invoice_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.payload<>v_payload then raise exception using errcode='SH410',message='command_key_reused'; end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  perform 1 from private.finance_quotes where clinic_id=p_clinic_id and id=p_quote_id and patient_id=p_patient_id for update;
  if not found then raise exception using errcode='PT404',message='quote_unavailable'; end if;
  select max(version) into v_current from private.finance_quote_versions where clinic_id=p_clinic_id and quote_id=p_quote_id;
  if v_current is distinct from p_quote_version then raise exception using errcode='SH409',message='quote_version_changed'; end if;
  if exists(select 1 from private.finance_invoice_drafts where clinic_id=p_clinic_id and quote_id=p_quote_id and quote_version=p_quote_version) then raise exception using errcode='SH409',message='invoice_already_prepared'; end if;
  v_snapshot:=private.quote_version_projection(p_clinic_id,p_quote_id,p_quote_version);
  if v_snapshot is null or v_snapshot->>'currency_code'<>'MAD' then raise exception using errcode='22023',message='unsupported_quote'; end if;
  v_total:=(v_snapshot->>'total_minor')::bigint;
  if v_total<=0 or v_total>1000000000000 or jsonb_array_length(v_snapshot->'details'->'lines')=0
    or (v_snapshot->'details'->>'subtotal_minor')::bigint-(v_snapshot->'details'->>'discount_minor')::bigint+(v_snapshot->'details'->>'tax_minor')::bigint<>v_total then
    raise exception using errcode='22023',message='inconsistent_quote';
  end if;
  if not exists(select 1 from private.finance_quote_lines where clinic_id=p_clinic_id and quote_id=p_quote_id and quote_version=p_quote_version
    having sum(subtotal_minor)=(v_snapshot->'details'->>'subtotal_minor')::bigint
      and sum(discount_minor)=(v_snapshot->'details'->>'discount_minor')::bigint
      and sum(tax_minor)=(v_snapshot->'details'->>'tax_minor')::bigint
      and sum(total_minor)=v_total) then raise exception using errcode='22023',message='inconsistent_quote_lines'; end if;
  select jsonb_build_object('id',id,'name',name) into v_clinic from public.clinics where id=p_clinic_id for share;
  select jsonb_build_object('id',id,'reference',reference,'display_name',display_name) into v_patient from public.patients where clinic_id=p_clinic_id and id=p_patient_id for share;
  v_snapshot:=jsonb_build_object('schema_version',1,'synthetic_only',true,'clinic',v_clinic,'patient',v_patient,
    'payer',v_patient,'payer_basis','patient_self_synthetic_fixture','quote',v_snapshot,'disclaimer','LOCAL SYNTHETIC DOCUMENT - NOT A STATUTORY INVOICE');
  insert into private.finance_invoice_drafts(clinic_id,id,patient_id,quote_id,quote_version,snapshot,total_minor,currency_code,created_by) values(p_clinic_id,v_id,p_patient_id,p_quote_id,p_quote_version,v_snapshot,v_total,'MAD',v_actor);
  v_receipt:=jsonb_build_object('invoice_id',v_id,'patient_id',p_patient_id,'quote_id',p_quote_id,'quote_version',p_quote_version,'state','draft','total_minor',v_total,'currency_code','MAD','synthetic_only',true,'replayed',false);
  insert into private.finance_invoice_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,v_payload,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalInvoicePrepared',v_id,p_request_key);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'LocalInvoicePrepared',1,'finance_invoice',v_id,p_request_key,v_actor,jsonb_build_object('synthetic_only',true));
  return v_receipt;
end $$;

create function public.issue_local_invoice(p_clinic_id uuid,p_patient_id uuid,p_invoice_id uuid,p_request_key uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_prior private.finance_invoice_commands;v_payload jsonb;v_draft private.finance_invoice_drafts;v_series text;v_number bigint;v_receipt jsonb;v_issued timestamptz:=clock_timestamp();
begin
  v_actor:=private.authorize_local_invoice(p_clinic_id,p_gate,true);
  if p_patient_id is null or p_invoice_id is null or p_request_key is null then raise exception using errcode='22023',message='invalid_invoice_command'; end if;
  v_payload:=jsonb_build_object('action','issue','patient_id',p_patient_id,'invoice_id',p_invoice_id);
  perform pg_advisory_xact_lock(hashtextextended('invoice:'||p_clinic_id::text||':'||v_actor::text||':'||p_request_key::text,0));
  select * into v_prior from private.finance_invoice_commands where clinic_id=p_clinic_id and actor_ref=v_actor and request_key=p_request_key;
  if found then
    if v_prior.payload<>v_payload then raise exception using errcode='SH410',message='command_key_reused'; end if;
    return v_prior.receipt||jsonb_build_object('replayed',true);
  end if;
  select * into v_draft from private.finance_invoice_drafts where clinic_id=p_clinic_id and id=p_invoice_id and patient_id=p_patient_id for update;
  if not found then raise exception using errcode='PT404',message='invoice_unavailable'; end if;
  if exists(select 1 from private.finance_issued_invoices where clinic_id=p_clinic_id and invoice_id=p_invoice_id) then raise exception using errcode='SH409',message='invoice_already_issued'; end if;
  select series_code into v_series from private.local_invoice_settings where clinic_id=p_clinic_id;
  insert into private.finance_invoice_counters(clinic_id,series_code) values(p_clinic_id,v_series) on conflict do nothing;
  update private.finance_invoice_counters set next_number=next_number+1 where clinic_id=p_clinic_id and series_code=v_series returning next_number-1 into v_number;
  insert into private.finance_issued_invoices(clinic_id,invoice_id,series_code,sequence_number,number,issued_by,issued_at) values(p_clinic_id,p_invoice_id,v_series,v_number,v_series||'-'||v_number::text,v_actor,v_issued);
  v_receipt:=jsonb_build_object('invoice_id',p_invoice_id,'patient_id',p_patient_id,'state','issued','number',v_series||'-'||v_number::text,'issued_at',to_char(v_issued at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'total_minor',v_draft.total_minor,'currency_code',v_draft.currency_code,'synthetic_only',true,'replayed',false);
  insert into private.finance_invoice_commands(clinic_id,actor_ref,request_key,payload,receipt) values(p_clinic_id,v_actor,p_request_key,v_payload,v_receipt);
  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id) values(p_clinic_id,v_actor,'LocalInvoiceIssued',p_invoice_id,p_request_key);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,payload) values(p_clinic_id,'LocalInvoiceIssued',1,'finance_invoice',p_invoice_id,p_request_key,v_actor,jsonb_build_object('synthetic_only',true));
  return v_receipt;
end $$;
revoke all on function public.prepare_local_invoice(uuid,uuid,uuid,integer,uuid,text),public.issue_local_invoice(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_local_invoice(uuid,uuid,uuid,integer,uuid,text),public.issue_local_invoice(uuid,uuid,uuid,uuid,text) to authenticated;
commit;
