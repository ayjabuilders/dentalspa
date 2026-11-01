begin;
-- Read immutable snapshots; disabling issuance must not rewrite/hide posted content.
create function public.read_local_invoices(p_clinic_id uuid,p_patient_id uuid,p_gate text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;v_truncated boolean;
begin
  perform private.authorize_local_quote_draft(p_clinic_id,p_gate);
  if not exists(select 1 from public.patients where clinic_id=p_clinic_id and id=p_patient_id) then
    raise exception using errcode='PT404',message='patient_unavailable';
  end if;
  select count(*)>50 into v_truncated from (select 1 from private.finance_invoice_drafts where clinic_id=p_clinic_id and patient_id=p_patient_id limit 51) d;
  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice_id',d.id,'patient_id',d.patient_id,'quote_id',d.quote_id,'quote_version',d.quote_version,
    'state',case when i.invoice_id is null then 'draft' else 'issued' end,
    'number',i.number,'issued_at',case when i.issued_at is null then null else to_char(i.issued_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'created_at',to_char(d.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'total_minor',d.total_minor,'currency_code',d.currency_code,'snapshot',d.snapshot
  ) order by d.created_at desc,d.id),'[]'::jsonb) into v_items
  from (select * from private.finance_invoice_drafts where clinic_id=p_clinic_id and patient_id=p_patient_id order by created_at desc,id limit 50) d
  left join private.finance_issued_invoices i on i.clinic_id=d.clinic_id and i.invoice_id=d.id;
  return jsonb_build_object('synthetic_only',true,'items',v_items,'truncated',v_truncated);
end $$;
revoke all on function public.read_local_invoices(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_local_invoices(uuid,uuid,text) to authenticated;
commit;
