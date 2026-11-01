-- Patient self-profile reads are authorized and audited in one transaction.
-- The audit/outbox payload carries no patient name, reference, contact, or content.
create function public.read_my_patient_profile(p_clinic_id uuid,p_correlation_id uuid)
returns table(id uuid,clinic_id uuid,display_name text,reference text)
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_patient public.patients;
  v_now timestamptz:=statement_timestamp();
begin
  if v_actor is null then raise exception using errcode='28000',message='Authentication required';end if;
  if p_clinic_id is null or p_correlation_id is null then raise exception using errcode='22023',message='Invalid profile request';end if;
  if coalesce(current_setting('request.method',true),'')<>'POST' then raise exception using errcode='22023',message='Invalid profile request';end if;

  -- Lock the verified link until this read and its audit records commit so a
  -- concurrent clinic unlink cannot race a successful patient-data response.
  select p.* into v_patient
  from public.patient_account_links l
  join public.patients p on p.clinic_id=l.clinic_id and p.id=l.patient_id
  where l.user_id=v_actor and l.clinic_id=p_clinic_id and l.verified_at is not null
  for share of l;
  if not found then return;end if;

  insert into private.audit_events(clinic_id,actor_ref,action,aggregate_id,correlation_id,occurred_at)
  values(v_patient.clinic_id,v_actor,'PatientProfileViewed',v_patient.id,p_correlation_id,v_now);
  insert into private.outbox_events(clinic_id,event_type,event_version,aggregate_type,aggregate_id,correlation_id,actor_ref,occurred_at,payload)
  values(v_patient.clinic_id,'PatientProfileViewed',1,'patient',v_patient.id,p_correlation_id,v_actor,v_now,
    jsonb_build_object('access_scope','own_profile'));

  return query select v_patient.id,v_patient.clinic_id,v_patient.display_name,v_patient.reference;
end $$;

revoke all on function public.read_my_patient_profile(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_my_patient_profile(uuid,uuid) to authenticated;
